'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  billingApi,
  BillingInterval,
  CreditPackage,
  PaymentMethod,
  PlanInfo,
  SubscriptionInfo,
  WalletBalance,
} from '@/lib/api/billing';

// ==================== QUERY KEYS ====================

export const billingKeys = {
  all: ['billing'] as const,
  subscription: () => [...billingKeys.all, 'subscription'] as const,
  plans: () => [...billingKeys.all, 'plans'] as const,
  paymentMethods: () => [...billingKeys.all, 'payment-methods'] as const,
  invoices: (params?: { page?: number; limit?: number }) =>
    [...billingKeys.all, 'invoices', params] as const,
  wallet: () => ['wallet'] as const,
  walletBalance: () => [...billingKeys.wallet(), 'balance'] as const,
  creditPackages: () => [...billingKeys.wallet(), 'packages'] as const,
  transactions: (params?: { page?: number; limit?: number; type?: string }) =>
    [...billingKeys.wallet(), 'transactions', params] as const,
};

// ==================== SUBSCRIPTION HOOKS ====================

export function useSubscription() {
  return useQuery<SubscriptionInfo>({
    queryKey: billingKeys.subscription(),
    queryFn: billingApi.getSubscription,
  });
}

export function usePlans() {
  return useQuery<PlanInfo[]>({
    queryKey: billingKeys.plans(),
    queryFn: billingApi.getPlans,
    staleTime: 1000 * 60 * 60, // 1 hour - plans don't change often
  });
}

export function useCreateCheckout() {
  return useMutation({
    mutationFn: (data: {
      plan: string;
      interval: BillingInterval;
      successUrl: string;
      cancelUrl: string;
    }) => billingApi.createCheckoutSession(data),
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    },
    onError: () => {
      toast.error('Failed to create checkout session');
    },
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: (returnUrl: string) => billingApi.createPortalSession(returnUrl),
    onSuccess: (data) => {
      // Redirect to Stripe Portal
      window.location.href = data.url;
    },
    onError: () => {
      toast.error('Failed to open billing portal');
    },
  });
}

// ==================== PAYMENT METHOD HOOKS ====================

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: billingKeys.paymentMethods(),
    queryFn: billingApi.getPaymentMethods,
  });
}

export function useSetDefaultPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingApi.setDefaultPaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
      toast.success('Default payment method updated');
    },
    onError: () => {
      toast.error('Failed to update payment method');
    },
  });
}

export function useRemovePaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentMethodId: string) => billingApi.removePaymentMethod(paymentMethodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.paymentMethods() });
      toast.success('Payment method removed');
    },
    onError: () => {
      toast.error('Failed to remove payment method');
    },
  });
}

// ==================== INVOICE HOOKS ====================

export function useInvoices(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: billingKeys.invoices(params),
    queryFn: () => billingApi.getInvoices(params),
  });
}

// ==================== WALLET HOOKS ====================

export function useWalletBalance() {
  return useQuery<WalletBalance>({
    queryKey: billingKeys.walletBalance(),
    queryFn: billingApi.getWalletBalance,
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}

export function useCreditPackages() {
  return useQuery<CreditPackage[]>({
    queryKey: billingKeys.creditPackages(),
    queryFn: billingApi.getCreditPackages,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function usePurchaseCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { packageId: string; customAmount?: number }) =>
      billingApi.purchaseCredits(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.walletBalance() });
      toast.success('Payment initiated');
    },
    onError: () => {
      toast.error('Failed to initiate payment');
    },
  });
}

export function useTransactions(params?: { page?: number; limit?: number; type?: string }) {
  return useQuery({
    queryKey: billingKeys.transactions(params),
    queryFn: () => billingApi.getTransactions(params),
  });
}

export function useUsageStats() {
  return useQuery({
    queryKey: [...billingKeys.all, 'usage'] as const,
    queryFn: billingApi.getUsageStats,
    refetchInterval: 1000 * 60, // Refetch every minute
  });
}
