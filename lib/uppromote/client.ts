const UPPROMOTE_BASE = 'https://aff-api.uppromote.com/api/v2';

export interface UpPromoteAffiliate {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified: string;
  company: string;
  address: string;
  city: string;
  state: string | null;
  zipcode: string;
  country: string;
  phone: string;
  facebook: string;
  twitter: string;
  youtube: string;
  instagram: string;
  website: string;
  tiktok: string;
  created_at: string;
  default_affiliate_link: string;
  custom_affiliate_link: string;
  program_id: number;
  program_name: string;
  custom_fields: string[];
  coupons: string[];
  paid_amount: number;
  approved_amount: number;
  pending_amount: number;
  denied_amount: number;
}

export interface UpPromoteReferral {
  id: number;
  order_id: number;
  order_number: number;
  customer_id: string;
  quantity: number;
  total_sales: string;
  commission_rule: {
    program_id: number;
    commission_rate: string;
    commission_type: string;
  };
  commission_adjustment: string;
  status: string;
  commission: string;
  refund_id: number | null;
  tracking_type: string;
  affiliate: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  coupon_applied: string;
  customer_email: string;
  created_at: string;
}

export interface UpPromotePaymentUnpaid {
  affiliate_id: number;
  affiliate_email: string;
  total_referrals: number;
  payment_method: string;
  total_commission: number;
  total_sales: number;
  total_products: number;
}

export interface UpPromotePaymentPaid {
  payment_id: number;
  affiliate_id: number;
  status: string;
  affiliate_email: string;
  total_referrals: number;
  total_processed: number;
  payment_method: string;
  processed_at: string;
}

interface UpPromoteResponse<T> {
  status: number;
  message: string;
  data: T[];
}

async function uppromoteRequest<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`${UPPROMOTE_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`UpPromote API error (${res.status}): ${body.substring(0, 300)}`);
  }

  return res.json();
}

/** Fetch all affiliates with pagination */
export async function fetchAllAffiliates(apiKey: string): Promise<UpPromoteAffiliate[]> {
  const all: UpPromoteAffiliate[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await uppromoteRequest<UpPromoteResponse<UpPromoteAffiliate>>(
      apiKey,
      '/affiliates',
      { page, per_page: perPage },
    );
    all.push(...res.data);
    if (res.data.length < perPage) break;
    page++;
  }

  return all;
}

/** Fetch referrals within a date range */
export async function fetchReferrals(
  apiKey: string,
  fromDate?: string,
  toDate?: string,
  page = 1,
  perPage = 100,
): Promise<UpPromoteResponse<UpPromoteReferral>> {
  const params: Record<string, string | number> = { page, per_page: perPage };
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  return uppromoteRequest<UpPromoteResponse<UpPromoteReferral>>(
    apiKey,
    '/referrals',
    params,
  );
}

/** Fetch all referrals with auto-pagination */
export async function fetchAllReferrals(
  apiKey: string,
  fromDate?: string,
  toDate?: string,
): Promise<UpPromoteReferral[]> {
  const all: UpPromoteReferral[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const res = await fetchReferrals(apiKey, fromDate, toDate, page, perPage);
    all.push(...res.data);
    if (res.data.length < perPage) break;
    page++;
  }

  return all;
}

/** Fetch unpaid payments */
export async function fetchUnpaidPayments(apiKey: string): Promise<UpPromotePaymentUnpaid[]> {
  const res = await uppromoteRequest<UpPromoteResponse<UpPromotePaymentUnpaid>>(
    apiKey,
    '/payments/unpaid',
  );
  return res.data;
}

/** Fetch paid payments */
export async function fetchPaidPayments(
  apiKey: string,
  fromDate?: string,
  toDate?: string,
): Promise<UpPromotePaymentPaid[]> {
  const params: Record<string, string | number> = { per_page: 100 };
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const res = await uppromoteRequest<UpPromoteResponse<UpPromotePaymentPaid>>(
    apiKey,
    '/payments/paid',
    params,
  );
  return res.data;
}

/** Validate an API key by fetching one affiliate */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await uppromoteRequest(apiKey, '/affiliates', { per_page: 1 });
    return true;
  } catch {
    return false;
  }
}
