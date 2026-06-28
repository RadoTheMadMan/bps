import { NextResponse } from 'next/server';
import { createServerInstance } from '@/utils/supabase/server';
import { enrichPlaceWithFirecrawl, PlaceRecord } from '@/lib/enrichment';

const DEFAULT_BATCH_SIZE = 10;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Number(body.batchSize) || DEFAULT_BATCH_SIZE;

    const supabase = await createServerInstance();

    const { data: targets, error: selectError } = await supabase
      .from('places')
      .select('id, name, website, address, enrichment_status, latitude, longitude')
      .eq('enrichment_status', 'raw_coordinates')
      .limit(batchSize);

    if (selectError) {
      console.error('Failed to select enrichment targets:', selectError);
      return NextResponse.json({ success: false, error: selectError.message || 'Selection failed' }, { status: 500 });
    }

    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: true, processed: 0, remaining: 0, continue: false });
    }

    const targetIds = targets.map((place: PlaceRecord) => place.id).filter(Boolean);
    if (targetIds.length === 0) {
      return NextResponse.json({ success: true, processed: 0, remaining: 0, continue: false });
    }

    const { error: lockError } = await supabase
      .from('places')
      .update({ enrichment_status: 'in_progress' })
      .in('id', targetIds);

    if (lockError) {
      console.error('Failed to lock enrichment targets:', lockError);
      return NextResponse.json({ success: false, error: lockError.message || 'Lock failed' }, { status: 500 });
    }

    let processed = 0;
    for (const place of targets as PlaceRecord[]) {
      console.log(`-> [ENRICHMENT BATCH]: Processing place ${place.name} (ID: ${place.id})`);
      await enrichPlaceWithFirecrawl(place, supabase);
      processed += 1;
    }

    const { data: remainingData, count: remainingCount, error: countError } = await supabase
      .from('places')
      .select('id', { count: 'exact', head: false })
      .eq('enrichment_status', 'raw_coordinates');

    if (countError) {
      console.warn('Failed to count remaining enrichment targets:', countError);
    }

    return NextResponse.json({
      success: true,
      processed,
      remaining: remainingCount ?? 0,
      continue: (remainingCount ?? 0) > 0,
    });
  } catch (error: any) {
    console.error('Critical enrichment endpoint failure:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
