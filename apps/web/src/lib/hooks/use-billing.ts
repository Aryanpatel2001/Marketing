'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { billingApi, PlanTier, TransactionType, TransactionChannel } from '@/lib/api/billing';
import { getErrorMessage } from '@/lib/api/client';

// Query keys
export const billingKeys = {
  all: ['billing'] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
  subscription: () => [...billingKeys.all, 'subscription'] as const,
  invoices: (limit?: number) => [...billingKeys.all, 'invoices', limit] as const,
  wallet: () => [...billingKeys.all, 'wallet'] as const,
  balance: () => [...billingKeys.wallet(), 'balance'] as const,
  transactions: (params?: Record<string, unknown>) =>
    [...billingKeys.wallet(), 'transactions', params] as const,
  usage: () => [...billingKeys.all, 'usage'] as const,
  usageSummary: () => [...billingKeys.usage(), 'summary'] as const,
  pricing: () => [...billingKeys.all, 'pricing'] as const,
};

// ==================== PLANS ====================

export function usePlans() {
  return useQuery({
    queryKey: billingKeys.plans(),
    queryFn: billingApi.getPlans,
    staleTime: 5 * 60 * 1000, // 5 minutes (plans don't change often)
  });
}

// ==================== SUBSCRIPTION ====================

export function useSubscription() {
  return useQuery({
    queryKey: billingKeys.subscription(),
    queryFn: billingApi.getSubscription,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (planTier: PlanTier) => billingApi.createSubscription(planTier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
      toast.success('Subscription created successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planTier, prorate }: { planTier: PlanTier; prorate?: boolean }) =>
      billingApi.updateSubscription(planTier, prorate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
      toast.success('Subscription updated successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cancelAtPeriodEnd, reason }: { cancelAtPeriodEnd?: boolean; reason?: string }) =>
      billingApi.cancelSubscription(cancelAtPeriodEnd, reason),
    onSuccess: (_, { cancelAtPeriodEnd }) => {
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      const message = cancelAtPeriodEnd
        ? 'Subscription will be cancelled at the end of the billing period'
        : 'Subscription cancelled successfully';
      toast.success(message);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useReactivateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: billingApi.reactivateSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      toast.success('Subscription reactivated successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (planTier: PlanTier) => billingApi.createCheckoutSession(planTier),
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useCreateBillingPortalSession() {
  return useMutation({
    mutationFn: billingApi.createBillingPortalSession,
    onSuccess: (data) => {
      // Redirect to Stripe Billing Portal
      window.location.href = data.url;
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ==================== WALLET ====================

export function useWallet() {
  return useQuery({
    queryKey: billingKeys.wallet(),
    queryFn: billingApi.getWallet,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useWalletBalance() {
  return useQuery({
    queryKey: billingKeys.balance(),
    queryFn: billingApi.getBalance,
    staleTime: 10 * 1000, // 10 seconds (balance changes frequently)
  });
}

export function useUpdateWalletSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: {
      lowBalanceThreshold?: number;
      autoRechargeEnabled?: boolean;
      autoRechargeAmount?: number;
      autoRechargeThreshold?: number;
    }) => billingApi.updateWalletSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.wallet() });
      toast.success('Wallet settings updated');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useCreateTopUpSession() {
  return useMutation({
    mutationFn: (amount: number) => billingApi.createTopUpSession(amount),
    onSuccess: (data) => {
      // Redirect to Stripe Checkout for top-up
      window.location.href = data.url;
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useTransactions(params?: {
  page?: number;
  limit?: number;
  type?: TransactionType;
  channel?: TransactionChannel;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: billingKeys.transactions(params),
    queryFn: () => billingApi.getTransactions(params),
    staleTime: 30 * 1000, // 30 seconds
  });
}

// ==================== USAGE ====================

export function useUsage() {
  return useQuery({
    queryKey: billingKeys.usage(),
    queryFn: billingApi.getUsage,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUsageSummary() {
  return useQuery({
    queryKey: billingKeys.usageSummary(),
    queryFn: billingApi.getUsageSummary,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useEstimateCost() {
  return useMutation({
    mutationFn: (params: {
      channel: 'sms' | 'email' | 'whatsapp';
      messageCount: number;
      countryCode?: string;
    }) => billingApi.estimateCost(params),
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function usePricing() {
  return useQuery({
    queryKey: billingKeys.pricing(),
    queryFn: billingApi.getPricing,
    staleTime: 60 * 60 * 1000, // 1 hour (pricing rarely changes)
  });
}

// ==================== INVOICES ====================

export function useInvoices(limit?: number) {
  return useQuery({
    queryKey: billingKeys.invoices(limit),
    queryFn: () => billingApi.getInvoices(limit),
    staleTime: 60 * 1000, // 1 minute
  });
}
