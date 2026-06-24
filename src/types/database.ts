export interface UserProfile {
  id: string;
  monthly_income: number;
  bill_expenses: number;
  subscription_tier_price: number;
  readonly deductibles: number; // GENERATED ALWAYS column
  target_budget: number;
  updated_at?: string;
}

export interface MapPlace {
  id: number;
  name?: string;
  latitude: number;
  longitude: number;
}

export interface PreferredItem {
  id: string;
  name: string;
  cost: number;
}