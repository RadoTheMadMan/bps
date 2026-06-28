import { NextResponse } from 'next/server';
import { createServerInstance } from '@/utils/supabase/server';
import { runEnrichmentBatch } from '@/lib/enrichment';

const DEFAULT_BATCH_SIZE = 10;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Number(body.batchSize) || DEFAULT_BATCH_SIZE;

    const supabase = await createServerInstance();
    const result = await runEnrichmentBatch(supabase, batchSize);

    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Critical enrichment endpoint failure:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error' }, { status: 500 });
  }
}
