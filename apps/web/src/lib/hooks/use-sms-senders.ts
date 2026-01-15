import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AddExistingNumberData,
  ListSendersParams,
  PurchaseNumberData,
  RegisterSenderIdData,
  SearchAvailableNumbersParams,
  SmsSender,
  smsSendersApi,
  UpdateSenderData,
} from '../api/sms';

// Query keys
export const smsSendersKeys = {
  all: ['sms-senders'] as const,
  list: (params?: ListSendersParams) => [...smsSendersKeys.all, 'list', params] as const,
  detail: (id: string) => [...smsSendersKeys.all, 'detail', id] as const,
  default: () => [...smsSendersKeys.all, 'default'] as const,
  limits: () => [...smsSendersKeys.all, 'limits'] as const,
  availableNumbers: (params: SearchAvailableNumbersParams) =>
    [...smsSendersKeys.all, 'available', params] as const,
};

/**
 * Hook for fetching all SMS senders
 */
export function useSmsSenders(params?: ListSendersParams) {
  return useQuery({
    queryKey: smsSendersKeys.list(params),
    queryFn: () => smsSendersApi.listSenders(params),
    staleTime: 30000,
  });
}

/**
 * Hook for fetching plan limits
 */
export function usePlanLimits() {
  return useQuery({
    queryKey: smsSendersKeys.limits(),
    queryFn: () => smsSendersApi.getPlanLimits(),
    staleTime: 60000,
  });
}

/**
 * Hook for fetching the default sender
 */
export function useDefaultSender() {
  return useQuery({
    queryKey: smsSendersKeys.default(),
    queryFn: () => smsSendersApi.getDefaultSender(),
    staleTime: 30000,
  });
}

/**
 * Hook for fetching a specific sender
 */
export function useSmsSender(senderId: string) {
  return useQuery({
    queryKey: smsSendersKeys.detail(senderId),
    queryFn: () => smsSendersApi.getSender(senderId),
    enabled: !!senderId,
  });
}

/**
 * Hook for searching available phone numbers
 */
export function useAvailableNumbers(params: SearchAvailableNumbersParams, enabled = true) {
  return useQuery({
    queryKey: smsSendersKeys.availableNumbers(params),
    queryFn: () => smsSendersApi.searchAvailableNumbers(params),
    enabled: enabled && !!params.country && !!params.type,
    staleTime: 60000,
  });
}

/**
 * Hook for purchasing a phone number
 */
export function usePurchaseNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PurchaseNumberData) => smsSendersApi.purchaseNumber(data),
    onSuccess: (sender: SmsSender) => {
      toast.success(`Phone number ${sender.phoneNumber} purchased successfully!`);
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to purchase phone number');
    },
  });
}

/**
 * Hook for adding an existing phone number (Twilio trial account support)
 */
export function useAddExistingNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AddExistingNumberData) => smsSendersApi.addExistingNumber(data),
    onSuccess: (sender: SmsSender) => {
      toast.success(`Phone number ${sender.phoneNumber} added successfully!`);
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to add phone number');
    },
  });
}

/**
 * Hook for setting up trial number from environment
 */
export function useSetupTrialNumber() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => smsSendersApi.setupTrialNumber(),
    onSuccess: (result) => {
      if ('message' in result) {
        toast.info(result.message);
      } else {
        toast.success(`Trial number ${result.phoneNumber} set up successfully!`);
      }
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to set up trial number');
    },
  });
}

/**
 * Hook for registering a sender ID
 */
export function useRegisterSenderId() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RegisterSenderIdData) => smsSendersApi.registerSenderId(data),
    onSuccess: () => {
      toast.success('Sender ID request submitted! Pending admin approval.');
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to register sender ID');
    },
  });
}

/**
 * Hook for updating a sender
 */
export function useUpdateSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ senderId, data }: { senderId: string; data: UpdateSenderData }) =>
      smsSendersApi.updateSender(senderId, data),
    onSuccess: () => {
      toast.success('Sender updated successfully!');
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update sender');
    },
  });
}

/**
 * Hook for setting a sender as default
 */
export function useSetDefaultSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (senderId: string) => smsSendersApi.setDefaultSender(senderId),
    onSuccess: () => {
      toast.success('Default sender updated!');
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to set default sender');
    },
  });
}

/**
 * Hook for releasing/deleting a sender
 */
export function useReleaseSender() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (senderId: string) => smsSendersApi.releaseSender(senderId),
    onSuccess: () => {
      toast.success('Sender released successfully!');
      queryClient.invalidateQueries({ queryKey: smsSendersKeys.all });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to release sender');
    },
  });
}
