import { apiClient } from './client';
import type { PaginatedResponse } from './contacts';

// ==================== TYPES ====================

export type CampaignType = 'email' | 'sms' | 'whatsapp';
export type CampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'sent'
  | 'cancelled'
  | 'failed';
export type AudienceType = 'all' | 'list' | 'segment';
export type MessageStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'failed'
  | 'unsubscribed'
  | 'complained'
  | 'read';

export interface EmailContent {
  subject: string;
  previewText?: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  htmlContent: string;
  designJson?: Record<string, unknown>;
}

export interface SmsContent {
  message: string;
  senderId?: string;
}

export interface WhatsAppContent {
  templateName: string;
  templateId: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    content: string;
  };
  body: string;
  bodyParameters?: string[];
  footer?: string;
  buttons?: Array<{
    type: 'QUICK_REPLY' | 'URL' | 'PHONE';
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
}

export type CampaignContent = EmailContent | SmsContent | WhatsAppContent;

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: CampaignType;
  status: CampaignStatus;
  templateId: string | null;
  content: CampaignContent;
  audienceType: AudienceType;
  contactListIds: string[];
  segmentCriteria: Record<string, unknown> | null;
  sendImmediately: boolean;
  scheduledAt: string | null;
  timezone: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  openedCount: number;
  uniqueOpens: number;
  clickedCount: number;
  uniqueClicks: number;
  bouncedCount: number;
  unsubscribedCount: number;
  complainedCount: number;
  readCount: number;
  repliedCount: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  template?: {
    id: string;
    name: string;
    type: CampaignType;
  } | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface CampaignMessage {
  id: string;
  campaignId: string;
  contactId: string;
  tenantId: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientName: string | null;
  externalId: string | null;
  status: MessageStatus;
  queuedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  renderedContent: Record<string, unknown> | null;
  createdAt: string;
  contact?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
}

export interface CampaignEvent {
  id: string;
  campaignMessageId: string | null;
  campaignId: string;
  contactId: string;
  tenantId: string;
  eventType: string;
  linkUrl: string | null;
  linkId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  replyContent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CampaignsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: CampaignType;
  status?: CampaignStatus;
  fromDate?: string;
  toDate?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateCampaignData {
  name: string;
  description?: string;
  type: CampaignType;
  templateId?: string;
  content?: CampaignContent;
  audienceType?: AudienceType;
  contactListIds?: string[];
  segmentCriteria?: Record<string, unknown>;
  sendImmediately?: boolean;
  scheduledAt?: string;
  timezone?: string;
}

export interface UpdateCampaignData extends Partial<CreateCampaignData> {
  status?: CampaignStatus;
}

export interface CampaignStats {
  campaign: Campaign;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
}

export interface CampaignOverview {
  total: number;
  byStatus: Record<CampaignStatus, number>;
  byType: Record<CampaignType, number>;
  recentCampaigns: Campaign[];
}

// ==================== API ====================

export const campaignsApi = {
  // ==================== CRUD ====================

  getCampaigns: async (query?: CampaignsQuery): Promise<PaginatedResponse<Campaign>> => {
    const response = await apiClient.get<PaginatedResponse<Campaign>>('/campaigns', {
      params: query,
    });
    return response.data;
  },

  getCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.get<Campaign>(`/campaigns/${id}`);
    return response.data;
  },

  createCampaign: async (data: CreateCampaignData): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>('/campaigns', data);
    return response.data;
  },

  updateCampaign: async (id: string, data: UpdateCampaignData): Promise<Campaign> => {
    const response = await apiClient.put<Campaign>(`/campaigns/${id}`, data);
    return response.data;
  },

  deleteCampaign: async (id: string): Promise<void> => {
    await apiClient.delete(`/campaigns/${id}`);
  },

  duplicateCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/duplicate`);
    return response.data;
  },

  // ==================== ACTIONS ====================

  scheduleCampaign: async (id: string, scheduledAt: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/schedule`, { scheduledAt });
    return response.data;
  },

  pauseCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/pause`);
    return response.data;
  },

  resumeCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/resume`);
    return response.data;
  },

  cancelCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/cancel`);
    return response.data;
  },

  sendCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<Campaign>(`/campaigns/${id}/send`);
    return response.data;
  },

  sendTestEmail: async (
    id: string,
    email: string
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await apiClient.post<{ success: boolean; error?: string }>(
      `/campaigns/${id}/test`,
      { email }
    );
    return response.data;
  },

  // ==================== STATS ====================

  getOverview: async (): Promise<CampaignOverview> => {
    const response = await apiClient.get<CampaignOverview>('/campaigns/overview');
    return response.data;
  },

  getStats: async (id: string): Promise<CampaignStats> => {
    const response = await apiClient.get<CampaignStats>(`/campaigns/${id}/stats`);
    return response.data;
  },

  getMessages: async (
    id: string,
    query?: { page?: number; limit?: number; status?: MessageStatus }
  ): Promise<PaginatedResponse<CampaignMessage>> => {
    const response = await apiClient.get<PaginatedResponse<CampaignMessage>>(
      `/campaigns/${id}/messages`,
      { params: query }
    );
    return response.data;
  },

  getEvents: async (
    id: string,
    query?: { page?: number; limit?: number }
  ): Promise<PaginatedResponse<CampaignEvent>> => {
    const response = await apiClient.get<PaginatedResponse<CampaignEvent>>(
      `/campaigns/${id}/events`,
      { params: query }
    );
    return response.data;
  },

  getActivityStats: async (
    id: string,
    interval: 'hour' | 'day' = 'hour'
  ): Promise<{
    timeline: Array<{
      timestamp: string;
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
      failed: number;
    }>;
  }> => {
    const response = await apiClient.get(`/campaigns/${id}/activity-stats`, {
      params: { interval },
    });
    return response.data;
  },
};
