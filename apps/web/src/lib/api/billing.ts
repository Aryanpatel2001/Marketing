import { apiClient } from './client';

// ==================== TYPES ====================

export enum SubscriptionPlan {
  FREE = 'free',
  STARTER = 'starter',
  GROWTH = 'growth',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum BillingInterval {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export interface WalletBalance {
  balance: number;
  reservedCredits: number;
  availableCredits: number;
  lifetimeCredits: number;
  currency: string;
  isLowBalance: boolean;
  lowBalanceThreshold: number;
}

export interface CreditPackage {
  id: string;
  credits: number;
  price: number;
  currency: string;
  pricePerCredit: number;
  discountPercent: number;
}

export interface SubscriptionInfo {
  plan: SubscriptionPlan;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };
}

export interface PlanInfo {
  plan: SubscriptionPlan;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: {
    maxContacts: number;
    maxCampaignsPerMonth: number;
    maxEmailsPerMonth: number;
    maxSmsPerMonth: number;
    maxUsersPerTenant: number;
  };
  popular?: boolean;
}

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface PaymentMethod {
  id: string;
  type: string;
  isDefault: boolean;
  brand?: string;
  lastFour?: string;
  expMonth?: number;
  expYear?: number;
}

export interface Invoice {
  id: string;
  stripeInvoiceId: string;
  status: string;
  amount: number;
  amountPaid: number;
  currency: string;
  invoiceNumber: string;
  invoiceUrl: string;
  pdfUrl: string;
  paidAt: string | null;
  createdAt: string;
}

export interface WalletTransaction {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface UsageStats {
  contacts: {
    used: number;
    limit: number;
    percentage: number;
  };
  campaigns: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  sms: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  emails: {
    used: number;
    limit: number;
    percentage: number;
    periodStart: string;
    periodEnd: string;
  };
  credits: {
    available: number;
    reserved: number;
    total: number;
  };
}

// ==================== API ====================

export const billingApi = {
  // Subscription endpoints
  getSubscription: async (): Promise<SubscriptionInfo> => {
    const response = await apiClient.get<SubscriptionInfo>('/billing/subscription');
    return response.data;
  },

  getPlans: async (): Promise<PlanInfo[]> => {
    const response = await apiClient.get<PlanInfo[]>('/billing/plans');
    return response.data;
  },

  createCheckoutSession: async (data: {
    plan: string;
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
  }): Promise<CheckoutSessionResponse> => {
    const response = await apiClient.post<CheckoutSessionResponse>('/billing/checkout', data);
    return response.data;
  },

  createPortalSession: async (returnUrl: string): Promise<{ url: string }> => {
    const response = await apiClient.post<{ url: string }>('/billing/portal', { returnUrl });
    return response.data;
  },

  // Payment methods
  getPaymentMethods: async (): Promise<PaymentMethod[]> => {
    const response = await apiClient.get<PaymentMethod[]>('/billing/payment-methods');
    return response.data;
  },

  setDefaultPaymentMethod: async (paymentMethodId: string): Promise<void> => {
    await apiClient.post(`/billing/payment-methods/${paymentMethodId}/default`);
  },

  removePaymentMethod: async (paymentMethodId: string): Promise<void> => {
    await apiClient.delete(`/billing/payment-methods/${paymentMethodId}`);
  },

  // Invoices
  getInvoices: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<{
    data: Invoice[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get('/billing/invoices', { params });
    return response.data;
  },

  // Wallet endpoints
  getWalletBalance: async (): Promise<WalletBalance> => {
    const response = await apiClient.get<WalletBalance>('/wallet/balance');
    return response.data;
  },

  getCreditPackages: async (): Promise<CreditPackage[]> => {
    const response = await apiClient.get<CreditPackage[]>('/wallet/packages');
    return response.data;
  },

  purchaseCredits: async (data: {
    packageId: string;
    customAmount?: number;
  }): Promise<{ clientSecret: string; paymentIntentId: string }> => {
    const response = await apiClient.post<{ clientSecret: string; paymentIntentId: string }>(
      '/wallet/credits',
      data
    );
    return response.data;
  },

  getTransactions: async (params?: {
    page?: number;
    limit?: number;
    type?: string;
  }): Promise<{
    data: WalletTransaction[];
    total: number;
    page: number;
    limit: number;
  }> => {
    const response = await apiClient.get('/wallet/transactions', { params });
    return response.data;
  },

  // Usage stats
  getUsageStats: async (): Promise<UsageStats> => {
    const response = await apiClient.get<UsageStats>('/billing/usage');
    return response.data;
  },
};
