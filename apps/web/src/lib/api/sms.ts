import { apiClient } from './client';

// ==================== TYPES ====================

export enum SmsSenderType {
  DEDICATED_NUMBER = 'dedicated_number',
  TOLL_FREE = 'toll_free',
  SENDER_ID = 'sender_id',
}

export enum SmsSenderStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  FAILED = 'failed',
  RELEASED = 'released',
}

export interface SmsSender {
  id: string;
  type: SmsSenderType;
  phoneNumber?: string;
  senderId?: string;
  countryCode?: string;
  senderIdCountries?: string[];
  friendlyName: string;
  status: SmsSenderStatus;
  monthlyPrice?: number;
  isDefault: boolean;
  messagesSent: number;
  deliveryRate: number;
  lastUsedAt?: string;
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
  purchasedAt?: string;
  renewsAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AvailableNumber {
  phoneNumber: string;
  country: string;
  region: string;
  type: 'local' | 'mobile' | 'toll_free';
  monthlyPrice: number;
  capabilities: {
    sms: boolean;
    voice: boolean;
    mms: boolean;
  };
}

export interface PlanLimits {
  maxDedicatedNumbers: number;
  maxTollFreeNumbers: number;
  senderIdsAllowed: boolean;
  currentDedicatedNumbers: number;
  currentTollFreeNumbers: number;
  currentSenderIds: number;
  canPurchaseDedicated: boolean;
  canPurchaseTollFree: boolean;
  canRegisterSenderId: boolean;
}

export interface SearchAvailableNumbersParams {
  country: string;
  type: 'local' | 'mobile' | 'toll_free';
  areaCode?: string;
  contains?: string;
  limit?: number;
}

export interface PurchaseNumberData {
  phoneNumber: string;
  friendlyName?: string;
}

export interface AddExistingNumberData {
  phoneNumber: string;
  friendlyName?: string;
  type?: 'local' | 'mobile' | 'toll_free';
}

export interface RegisterSenderIdData {
  senderId: string;
  countries: string[];
  friendlyName?: string;
}

export interface UpdateSenderData {
  friendlyName?: string;
  isDefault?: boolean;
}

export interface ListSendersParams {
  type?: SmsSenderType;
  status?: SmsSenderStatus;
  page?: number;
  limit?: number;
}

export interface ListSendersResponse {
  data: SmsSender[];
  total: number;
  page: number;
  limit: number;
}

export interface PhoneValidationResult {
  isValid: boolean;
  phoneNumber: string;
  countryCode: string | null;
  nationalNumber: string | null;
  internationalFormat: string | null;
  e164Format: string | null;
  carrier: string | null;
  lineType: string | null;
}

export interface SegmentCalculation {
  message: string;
  length: number;
  segments: number;
  encoding: 'GSM-7' | 'UCS-2';
  segmentSize: number;
  charactersPerSegment: number;
  remainingCharacters: number;
}

export interface ValidatePhoneData {
  phoneNumber: string;
  countryCode?: string;
}

export interface CalculateSegmentsData {
  message: string;
}

export interface SendTestSmsData {
  phoneNumber: string;
}

// ==================== SMS SENDERS API ====================

export const smsSendersApi = {
  /**
   * Search available phone numbers to purchase
   */
  searchAvailableNumbers: async (
    params: SearchAvailableNumbersParams
  ): Promise<AvailableNumber[]> => {
    const response = await apiClient.get<AvailableNumber[]>('/sms/senders/available-numbers', {
      params,
    });
    return response.data;
  },

  /**
   * Purchase a phone number
   */
  purchaseNumber: async (data: PurchaseNumberData): Promise<SmsSender> => {
    const response = await apiClient.post<SmsSender>('/sms/senders/purchase-number', data);
    return response.data;
  },

  /**
   * Add an existing phone number (for Twilio trial accounts)
   * Use this instead of purchaseNumber when using a trial Twilio account
   */
  addExistingNumber: async (data: AddExistingNumberData): Promise<SmsSender> => {
    const response = await apiClient.post<SmsSender>('/sms/senders/add-existing', data);
    return response.data;
  },

  /**
   * Auto-setup trial number from environment
   * Registers the TWILIO_PHONE_NUMBER from server environment as a sender
   */
  setupTrialNumber: async (): Promise<SmsSender | { message: string }> => {
    const response = await apiClient.post<SmsSender | { message: string }>(
      '/sms/senders/setup-trial'
    );
    return response.data;
  },

  /**
   * Register a new Sender ID (Enterprise only)
   */
  registerSenderId: async (data: RegisterSenderIdData): Promise<SmsSender> => {
    const response = await apiClient.post<SmsSender>('/sms/senders/sender-id', data);
    return response.data;
  },

  /**
   * List all SMS senders
   */
  listSenders: async (params?: ListSendersParams): Promise<ListSendersResponse> => {
    const response = await apiClient.get<ListSendersResponse>('/sms/senders', { params });
    return response.data;
  },

  /**
   * Get plan limits
   */
  getPlanLimits: async (): Promise<PlanLimits> => {
    const response = await apiClient.get<PlanLimits>('/sms/senders/limits');
    return response.data;
  },

  /**
   * Get default sender
   */
  getDefaultSender: async (): Promise<SmsSender | null> => {
    const response = await apiClient.get<SmsSender | null>('/sms/senders/default');
    return response.data;
  },

  /**
   * Get a specific sender by ID
   */
  getSender: async (senderId: string): Promise<SmsSender> => {
    const response = await apiClient.get<SmsSender>(`/sms/senders/${senderId}`);
    return response.data;
  },

  /**
   * Update a sender
   */
  updateSender: async (senderId: string, data: UpdateSenderData): Promise<SmsSender> => {
    const response = await apiClient.patch<SmsSender>(`/sms/senders/${senderId}`, data);
    return response.data;
  },

  /**
   * Set a sender as default
   */
  setDefaultSender: async (senderId: string): Promise<SmsSender> => {
    const response = await apiClient.post<SmsSender>(`/sms/senders/${senderId}/default`);
    return response.data;
  },

  /**
   * Release/delete a sender
   */
  releaseSender: async (senderId: string): Promise<void> => {
    await apiClient.delete(`/sms/senders/${senderId}`);
  },
};

// ==================== SMS UTILITY API ====================

export const smsApi = {
  /**
   * Validate a phone number
   */
  validatePhone: async (data: ValidatePhoneData): Promise<PhoneValidationResult> => {
    const response = await apiClient.post<PhoneValidationResult>('/sms/validate-phone', data);
    return response.data;
  },

  /**
   * Calculate SMS segments and encoding for a message
   */
  calculateSegments: async (data: CalculateSegmentsData): Promise<SegmentCalculation> => {
    const response = await apiClient.post<SegmentCalculation>('/sms/calculate-segments', data);
    return response.data;
  },

  /**
   * Send a test SMS for a campaign
   */
  sendTestSms: async (
    campaignId: string,
    data: SendTestSmsData
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await apiClient.post<{ success: boolean; error?: string }>(
      `/campaigns/${campaignId}/test/sms`,
      data
    );
    return response.data;
  },
};
