'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  smsComplianceApi,
  ComplianceMode,
  UpdateUS10DLCStatusDto,
  ValidateMessageDto,
  ValidateCampaignDto,
  RegisterEUSenderIdDto,
} from '@/lib/api/sms-compliance';
import { getErrorMessage } from '@/lib/api/client';

// Query keys
export const smsComplianceKeys = {
  all: ['sms-compliance'] as const,
  status: () => [...smsComplianceKeys.all, 'status'] as const,
  regionStatus: (region: string) => [...smsComplianceKeys.status(), region] as const,
  us: () => [...smsComplianceKeys.all, 'us'] as const,
  usStatus: () => [...smsComplianceKeys.us(), 'status'] as const,
  usGuide: () => [...smsComplianceKeys.us(), 'guide'] as const,
  eu: () => [...smsComplianceKeys.all, 'eu'] as const,
  euRules: () => [...smsComplianceKeys.eu(), 'rules'] as const,
  euSenderIds: () => [...smsComplianceKeys.eu(), 'sender-ids'] as const,
};

// ==================== Overall Status ====================

export function useComplianceStatus() {
  return useQuery({
    queryKey: smsComplianceKeys.status(),
    queryFn: smsComplianceApi.getComplianceStatus,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useRegionStatus(region: 'us' | 'eu') {
  return useQuery({
    queryKey: smsComplianceKeys.regionStatus(region),
    queryFn: () => smsComplianceApi.getRegionStatus(region),
    staleTime: 30 * 1000,
  });
}

export function useUpdateComplianceMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (mode: ComplianceMode) => smsComplianceApi.updateComplianceMode({ mode }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.status() });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ==================== Validation ====================

export function useValidateMessage() {
  return useMutation({
    mutationFn: (dto: ValidateMessageDto) => smsComplianceApi.validateMessage(dto),
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useValidateCampaign() {
  return useMutation({
    mutationFn: (dto: ValidateCampaignDto) => smsComplianceApi.validateCampaign(dto),
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ==================== US 10DLC ====================

export function useUS10DLCStatus() {
  return useQuery({
    queryKey: smsComplianceKeys.usStatus(),
    queryFn: smsComplianceApi.getUS10DLCStatus,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useUS10DLCGuide() {
  return useQuery({
    queryKey: smsComplianceKeys.usGuide(),
    queryFn: smsComplianceApi.getUS10DLCGuide,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useRefreshUS10DLCStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: smsComplianceApi.refreshUS10DLCStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.us() });
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.status() });
      toast.success('US 10DLC status refreshed');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useUpdateUS10DLCStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdateUS10DLCStatusDto) => smsComplianceApi.updateUS10DLCStatus(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.us() });
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.status() });
      toast.success('US 10DLC status updated');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// ==================== EU GDPR ====================

export function useEUCountryRules() {
  return useQuery({
    queryKey: smsComplianceKeys.euRules(),
    queryFn: smsComplianceApi.getEUCountryRules,
    staleTime: 60 * 60 * 1000, // 1 hour (rules don't change often)
  });
}

export function useRegisteredSenderIds() {
  return useQuery({
    queryKey: smsComplianceKeys.euSenderIds(),
    queryFn: smsComplianceApi.getRegisteredSenderIds,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useRegisterEUSenderId() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: RegisterEUSenderIdDto) => smsComplianceApi.registerEUSenderId(dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.eu() });
      queryClient.invalidateQueries({ queryKey: smsComplianceKeys.status() });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}
