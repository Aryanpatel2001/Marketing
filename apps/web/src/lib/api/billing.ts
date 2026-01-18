import { apiClient } from './client';

// ==================== TYPES ====================

export type PlanTier = 'free' | 'starter' | 'growth' | 'pro' | 'enterprise';
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'unpaid'
  | 'incomplete';
export type TransactionType = 'credit' | 'debit' | 'refund' | 'reserve' | 'release';
export type TransactionChannel = 'sms' | 'email' | 'whatsapp' | 'platform';

export interface Plan {
  id: string;
  name: string;
  tier: PlanTier;
  description: string;
  price: number;
  interval: 'monthly' | 'yearly';
  smsQuota: number;
  emailQuota: number;
  whatsappQuota: number;
  maxContacts: number;
  maxSenders: number;
  maxUsers: number;
  features: {
    apiAccess: boolean;
    customDomain: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
    webhooks: boolean;
    automations: boolean;
    abTesting: boolean;
    dedicatedIp: boolean;
    whiteLabel: boolean;
  };
  trialDays: number;
}

export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  planTier: PlanTier;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  price: number;
  interval: string;
}

export interface Wallet {
  id: string;
  balance: number;
  reservedBalance: number;
  availableBalance: number;
  currency: string;
  lowBalanceThreshold: number;
  autoRechargeEnabled: boolean;
  autoRechargeAmount: number;
  autoRechargeThreshold: number;
  totalCredited: number;
  totalDebited: number;
  lastToppedUpAt: string | null;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  status: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  channel: TransactionChannel | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export interface TransactionListResponse {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ChannelUsage {
  used: number;
  limit: number;
  overage: number;
  remaining: number;
  percentUsed: number;
  cost: number;
}

export interface ResourceUsage {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}

export interface Usage {
  periodStart: string;
  periodEnd: string;
  sms: ChannelUsage;
  email: ChannelUsage;
  whatsapp: ChannelUsage;
  contacts: ResourceUsage;
  campaigns: ResourceUsage;
  totalCost: number;
}

export interface UsageSummary {
  currentPeriod: Usage | null;
  subscription: {
    plan: string;
    status: string;
    renewsAt: string | null;
  } | null;
  wallet: {
    balance: number;
    currency: string;
  };
}

export interface CostEstimate {
  channel: string;
  messageCount: number;
  quotaRemaining: number;
  fromQuota: number;
  fromWallet: number;
  unitPrice: number;
  estimatedCost: number;
  walletBalance: number;
  hasSufficientFunds: boolean;
  shortfall: number;
}

export interface PricingTable {
  sms: Record<string, number>;
  email: number;
  whatsapp: {
    message: number;
    conversation: number;
  };
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  invoiceUrl: string | null;
  pdfUrl: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceListResponse {
  data: Invoice[];
  total: number;
}

// ==================== API ====================

export const billingApi = {
  // Plans
  getPlans: async (): Promise<Plan[]> => {
    const response = await apiClient.get<Plan[]>('/billing/subscriptions/plans');
    return response.data;
  },

  // Subscription
  getSubscription: async (): Promise<Subscription | null> => {
    const response = await apiClient.get<Subscription | null>('/billing/subscriptions');
    return response.data;
  },

  createSubscription: async (planTier: PlanTier): Promise<Subscription> => {
    const response = await apiClient.post<Subscription>('/billing/subscriptions', { planTier });
    return response.data;
  },

  updateSubscription: async (planTier: PlanTier, prorate?: boolean): Promise<Subscription> => {
    const response = await apiClient.put<Subscription>('/billing/subscriptions', {
      planTier,
      prorate,
    });
    return response.data;
  },

  cancelSubscription: async (
    cancelAtPeriodEnd?: boolean,
    reason?: string
  ): Promise<Subscription> => {
    const response = await apiClient.delete<Subscription>('/billing/subscriptions', {
      data: { cancelAtPeriodEnd, reason },
    });
    return response.data;
  },

  reactivateSubscription: async (): Promise<Subscription> => {
    const response = await apiClient.post<Subscription>('/billing/subscriptions/reactivate');
    return response.data;
  },

  createCheckoutSession: async (
    planTier: PlanTier
  ): Promise<{ url: string; sessionId: string }> => {
    const response = await apiClient.post<{ url: string; sessionId: string }>(
      '/billing/subscriptions/checkout',
      { planTier }
    );
    return response.data;
  },

  // Onboarding checkout - used after registration for initial plan selection
  createOnboardingCheckout: async (
    planTier: PlanTier
  ): Promise<{ url: string; sessionId: string }> => {
    const response = await apiClient.post<{ url: string; sessionId: string }>(
      '/billing/subscriptions/onboarding-checkout',
      { planTier }
    );
    return response.data;
  },

  createBillingPortalSession: async (): Promise<{ url: string }> => {
    const response = await apiClient.post<{ url: string }>('/billing/subscriptions/billing-portal');
    return response.data;
  },

  // Wallet
  getWallet: async (): Promise<Wallet> => {
    const response = await apiClient.get<Wallet>('/billing/wallet');
    return response.data;
  },

  updateWalletSettings: async (settings: {
    lowBalanceThreshold?: number;
    autoRechargeEnabled?: boolean;
    autoRechargeAmount?: number;
    autoRechargeThreshold?: number;
  }): Promise<Wallet> => {
    const response = await apiClient.put<Wallet>('/billing/wallet/settings', settings);
    return response.data;
  },

  createTopUpSession: async (amount: number): Promise<{ url: string; sessionId: string }> => {
    const response = await apiClient.post<{ url: string; sessionId: string }>(
      '/billing/wallet/topup',
      { amount }
    );
    return response.data;
  },

  getTransactions: async (params?: {
    page?: number;
    limit?: number;
    type?: TransactionType;
    channel?: TransactionChannel;
    startDate?: string;
    endDate?: string;
  }): Promise<TransactionListResponse> => {
    const response = await apiClient.get<TransactionListResponse>('/billing/wallet/transactions', {
      params,
    });
    return response.data;
  },

  getBalance: async (): Promise<{
    balance: number;
    available: number;
    reserved: number;
    currency: string;
  }> => {
    const response = await apiClient.get<{
      balance: number;
      available: number;
      reserved: number;
      currency: string;
    }>('/billing/wallet/balance');
    return response.data;
  },

  // Usage
  getUsage: async (): Promise<Usage> => {
    const response = await apiClient.get<Usage>('/billing/usage');
    return response.data;
  },

  getUsageSummary: async (): Promise<UsageSummary> => {
    const response = await apiClient.get<UsageSummary>('/billing/usage/summary');
    return response.data;
  },

  estimateCost: async (params: {
    channel: 'sms' | 'email' | 'whatsapp';
    messageCount: number;
    countryCode?: string;
  }): Promise<CostEstimate> => {
    const response = await apiClient.post<CostEstimate>('/billing/usage/estimate', params);
    return response.data;
  },

  getPricing: async (): Promise<PricingTable> => {
    const response = await apiClient.get<PricingTable>('/billing/usage/pricing');
    return response.data;
  },

  // Invoices
  getInvoices: async (limit?: number): Promise<InvoiceListResponse> => {
    const response = await apiClient.get<InvoiceListResponse>('/billing/subscriptions/invoices', {
      params: { limit },
    });
    return response.data;
  },

  getInvoice: async (invoiceId: string): Promise<Invoice> => {
    const response = await apiClient.get<Invoice>(`/billing/subscriptions/invoices/${invoiceId}`);
    return response.data;
  },
};
