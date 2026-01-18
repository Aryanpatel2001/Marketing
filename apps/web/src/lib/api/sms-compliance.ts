import { apiClient } from './client';

// ==================== TYPES ====================

export type ComplianceMode = 'strict' | 'warn' | 'off';
export type ComplianceStatus =
  | 'not_started'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'suspended';
export type US10DLCBrandStatus =
  | 'not_registered'
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'suspended';
export type US10DLCCampaignStatus =
  | 'not_registered'
  | 'pending'
  | 'in_review'
  | 'verified'
  | 'rejected'
  | 'suspended';
export type TenantRegion = 'US' | 'EU';

export interface ComplianceSummary {
  us: {
    status: ComplianceStatus;
    isCompliant: boolean;
    details: string;
  };
  eu: {
    status: ComplianceStatus;
    isCompliant: boolean;
    details: string;
  };
  mode: ComplianceMode;
}

export interface US10DLCStatus {
  brandStatus: US10DLCBrandStatus;
  brandName?: string;
  campaignStatus: US10DLCCampaignStatus;
  isCompliant: boolean;
  trustHubUrl: string;
  errors: string[];
}

export interface US10DLCGuide {
  trustHubUrl: string;
  steps: {
    step: number;
    title: string;
    description: string;
    status: 'completed' | 'pending';
  }[];
  estimatedTime: string;
  documentation: string;
}

export interface EUCountryRules {
  countryCode: string;
  countryName: string;
  requiresOptOutMention: boolean;
  optOutText?: string;
  maxSenderIdLength: number;
  senderIdRegistrationRequired: boolean;
  specialRestrictions?: string[];
}

export interface ValidationResult {
  valid: boolean;
  region: string;
  errors: string[];
  warnings: string[];
  complianceMode: ComplianceMode;
}

export interface CampaignValidationResult {
  valid: boolean;
  totalRecipients: number;
  regionBreakdown: Record<string, number>;
  errors: string[];
  warnings: string[];
  blockedCount: number;
}

// ==================== DTOs ====================

export interface UpdateComplianceModeDto {
  mode: ComplianceMode;
}

export interface ValidateMessageDto {
  phoneNumber: string;
  message?: string;
}

export interface ValidateCampaignDto {
  phoneNumbers: string[];
  message?: string;
}

export interface UpdateUS10DLCStatusDto {
  brandStatus?: US10DLCBrandStatus;
  brandSid?: string;
  brandName?: string;
  campaignStatus?: US10DLCCampaignStatus;
  campaignSid?: string;
  messagingServiceSid?: string;
}

export interface RegisterEUSenderIdDto {
  country: string;
  senderId: string;
  registrationId?: string;
}

// ==================== API ====================

export const smsComplianceApi = {
  // ==================== Overall Status ====================

  getComplianceStatus: async (): Promise<ComplianceSummary> => {
    const response = await apiClient.get<ComplianceSummary>('/sms/compliance/status');
    return response.data;
  },

  getRegionStatus: async (
    region: 'us' | 'eu'
  ): Promise<{
    region: string;
    status: ComplianceStatus;
    isCompliant: boolean;
  }> => {
    const response = await apiClient.get<{
      region: string;
      status: ComplianceStatus;
      isCompliant: boolean;
    }>(`/sms/compliance/status/${region}`);
    return response.data;
  },

  updateComplianceMode: async (
    dto: UpdateComplianceModeDto
  ): Promise<{
    mode: ComplianceMode;
    message: string;
  }> => {
    const response = await apiClient.patch<{
      mode: ComplianceMode;
      message: string;
    }>('/sms/compliance/mode', dto);
    return response.data;
  },

  // ==================== Validation ====================

  validateMessage: async (dto: ValidateMessageDto): Promise<ValidationResult> => {
    const response = await apiClient.post<ValidationResult>('/sms/compliance/validate', dto);
    return response.data;
  },

  validateCampaign: async (dto: ValidateCampaignDto): Promise<CampaignValidationResult> => {
    const response = await apiClient.post<CampaignValidationResult>(
      '/sms/compliance/validate/campaign',
      dto
    );
    return response.data;
  },

  // ==================== US 10DLC ====================

  getUS10DLCStatus: async (): Promise<US10DLCStatus> => {
    const response = await apiClient.get<US10DLCStatus>('/sms/compliance/us/status');
    return response.data;
  },

  getUS10DLCGuide: async (): Promise<US10DLCGuide> => {
    const response = await apiClient.get<US10DLCGuide>('/sms/compliance/us/guide');
    return response.data;
  },

  refreshUS10DLCStatus: async (): Promise<{
    brandStatus: US10DLCBrandStatus;
    campaignStatus: US10DLCCampaignStatus;
    lastCheckedAt: string;
  }> => {
    const response = await apiClient.post<{
      brandStatus: US10DLCBrandStatus;
      campaignStatus: US10DLCCampaignStatus;
      lastCheckedAt: string;
    }>('/sms/compliance/us/refresh');
    return response.data;
  },

  updateUS10DLCStatus: async (
    dto: UpdateUS10DLCStatusDto
  ): Promise<{
    brandStatus: US10DLCBrandStatus;
    campaignStatus: US10DLCCampaignStatus;
    isCompliant: boolean;
  }> => {
    const response = await apiClient.patch<{
      brandStatus: US10DLCBrandStatus;
      campaignStatus: US10DLCCampaignStatus;
      isCompliant: boolean;
    }>('/sms/compliance/us/status', dto);
    return response.data;
  },

  // ==================== EU GDPR ====================

  getEUCountryRules: async (): Promise<EUCountryRules[]> => {
    const response = await apiClient.get<EUCountryRules[]>('/sms/compliance/eu/rules');
    return response.data;
  },

  registerEUSenderId: async (
    dto: RegisterEUSenderIdDto
  ): Promise<{
    country: string;
    senderId: string;
    message: string;
  }> => {
    const response = await apiClient.post<{
      country: string;
      senderId: string;
      message: string;
    }>('/sms/compliance/eu/sender-id', dto);
    return response.data;
  },

  getRegisteredSenderIds: async (): Promise<Record<string, string>> => {
    const response = await apiClient.get<Record<string, string>>('/sms/compliance/eu/sender-ids');
    return response.data;
  },
};
