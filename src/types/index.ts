// Plot Holders Club - Core Type Definitions

export type Tier = 'seedling' | 'grower' | 'homesteader' | 'landowner';

export type Channel = 'shopify' | 'qashier' | 'manual' | 'referral';

export type MigrationSource = 'qashier' | 'shopify' | 'manual' | 'referral' | 'grandfather';

export interface Customer {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  birthday: string | null; // ISO date string (YYYY-MM-DD)
  tier: Tier;
  lifetime_acres: number;
  shopify_customer_id: number | null;
  qashier_customer_id: string | null;
  referral_code: string | null;
  referred_by: string | null;
  migration_source: MigrationSource | null;
  is_merged: boolean;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
}

export interface Acre {
  id: string;
  customer_id: string;
  channel: Channel;
  source_id: string | null;
  amount: number;
  reason: string | null;
  order_total: number | null;
  outlet: string | null;
  created_at: string;
}

export interface Reward {
  id: string;
  customer_id: string;
  tier: Tier;
  reward_type: string;
  redeemed_at: string;
  channel: string | null;
  staff_id: string | null;
  notes: string | null;
}

export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  bonus_awarded: boolean;
  created_at: string;
}

export interface ShopifySync {
  order_id: number;
  customer_id: string | null;
  acres_awarded: number | null;
  synced_at: string;
}

export interface QashierImport {
  id: string;
  filename: string | null;
  rows_processed: number | null;
  rows_matched: number | null;
  rows_new: number | null;
  imported_at: string;
}

// API Request/Response Types

export interface CreateCustomerRequest {
  phone: string;
  email?: string;
  name?: string;
  birthday?: string;
  referred_by_code?: string; // referral code of the person who referred them
}

export interface UpdateCustomerRequest {
  name?: string;
  email?: string;
  birthday?: string;
  tier?: Tier; // manual tier override (rare)
}

export interface AddAcresRequest {
  customer_id: string;
  channel: Channel;
  source_id?: string;
  amount?: number;
  reason?: string;
  order_total?: number;
  outlet?: string;
}

export interface RedeemRewardRequest {
  customer_id: string;
  reward_type: string;
  channel?: string;
  staff_id?: string;
  notes?: string;
}

export interface MergeCustomersRequest {
  primary_id: string;   // customer to keep
  duplicate_id: string; // customer to merge into primary (will be soft deleted)
}

export interface CustomerWithHistory extends Customer {
  acre_history: Acre[];
  reward_history: Reward[];
  referral_count: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

// Error response shape
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}
