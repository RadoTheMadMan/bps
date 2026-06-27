'use client';
import { useState } from 'react';
import { supabase } from '@/utils/supabase/client';

export default function SettingsPage() {
  const [income, setIncome] = useState(0);
  const [bills, setBills] = useState(0);
  const [tierPrice, setTierPrice] = useState(0);
  const [budget, setBudget] = useState(0);

  const handleUpdateFinances = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Exact structural formula constraint check
    const calculatedDeductibles = income - (bills + tierPrice);
    if (budget > calculatedDeductibles) {
      alert("Overspending Denied: Budget cannot exceed your absolute deductibles margin!");
      return;
    }

    const { error } = await supabase
      .from('users')
      .update({
        monthly_income: income,
        bill_expenses: bills,
        subscription_tier_price: tierPrice,
        target_budget: budget
      })
      .eq('id', (await supabase.auth.getUser()).data.user?.id);

    if (error) alert(`Sync Failure: ${error.message}`);
  };

  return (
    <div className="p-8 max-w-lg mx-auto">
      <h2 className="text-xl font-bold mb-4">System Constants Adjustment</h2>
      <form onSubmit={handleUpdateFinances} className="flex flex-col gap-3">
        <label>Monthly Income</label><input type="number" onChange={e => setIncome(Number(e.target.value))} className="border p-2 rounded" />
        <label>Bill Expenses</label><input type="number" onChange={e => setBills(Number(e.target.value))} className="border p-2 rounded" />
        <label>Subscription Tier Cost</label><input type="number" onChange={e => setTierPrice(Number(e.target.value))} className="border p-2 rounded" />
        <label>Target Budget Limit</label><input type="number" onChange={e => setBudget(Number(e.target.value))} className="border p-2 rounded" />
        <button type="submit" className="bg-green-700 text-white p-2 rounded mt-2">Commit Framework</button>
      </form>
    </div>
  );
}