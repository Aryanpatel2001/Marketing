import { apiClient } from './client';
import { PaginatedResponse } from './contacts';

export type CampaignType = 'email' | 'sms' | 'whatsapp';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  subject?: string;
  previewText?: string;
  content: string;
  templateId?: string;
  listIds: string[];
  segmentIds?: string[];
  scheduledAt?: string;
  sentAt?: string;
  stats: CampaignStats;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignStats {
  totalRecipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  complained: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface CampaignsQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: CampaignType;
  status?: CampaignStatus;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateCampaignData {
  name: string;
  type: CampaignType;
  subject?: string;
  previewText?: string;
  content: string;
  templateId?: string;
  listIds: string[];
  segmentIds?: string[];
  scheduledAt?: string;
}

export interface UpdateCampaignData extends Partial<CreateCampaignData> {}

export interface SendTestData {
  email?: string;
  phone?: string;
}

export const campaignsApi = {
  getCampaigns: async (query?: CampaignsQuery): Promise<PaginatedResponse<Campaign>> => {
    const response = await apiClient.get<{ data: PaginatedResponse<Campaign> }>('/campaigns', {
      params: query,
    });
    return response.data.data;
  },

  getCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.get<{ data: Campaign }>(`/campaigns/${id}`);
    return response.data.data;
  },

  createCampaign: async (data: CreateCampaignData): Promise<Campaign> => {
    const response = await apiClient.post<{ data: Campaign }>('/campaigns', data);
    return response.data.data;
  },

  updateCampaign: async (id: string, data: UpdateCampaignData): Promise<Campaign> => {
    const response = await apiClient.patch<{ data: Campaign }>(`/campaigns/${id}`, data);
    return response.data.data;
  },

  deleteCampaign: async (id: string): Promise<void> => {
    await apiClient.delete(`/campaigns/${id}`);
  },

  duplicateCampaign: async (id: string): Promise<Campaign> => {
    const response = await apiClient.post<{ data: Campaign }>(`/campaigns/${id}/duplicate`);
    return response.data.data;
  },

  sendCampaign: async (id: string): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/send`);
  },

  scheduleCampaign: async (id: string, scheduledAt: string): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/schedule`, { scheduledAt });
  },

  pauseCampaign: async (id: string): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/pause`);
  },

  resumeCampaign: async (id: string): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/resume`);
  },

  cancelCampaign: async (id: string): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/cancel`);
  },

  sendTest: async (id: string, data: SendTestData): Promise<void> => {
    await apiClient.post(`/campaigns/${id}/test`, data);
  },

  getCampaignStats: async (id: string): Promise<CampaignStats> => {
    const response = await apiClient.get<{ data: CampaignStats }>(`/campaigns/${id}/stats`);
    return response.data.data;
  },

  getCampaignEvents: async (
    id: string,
    query?: { page?: number; limit?: number; type?: string }
  ): Promise<PaginatedResponse<CampaignEvent>> => {
    const response = await apiClient.get<{ data: PaginatedResponse<CampaignEvent> }>(
      `/campaigns/${id}/events`,
      { params: query }
    );
    return response.data.data;
  },
};

export interface CampaignEvent {
  id: string;
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed' | 'complained';
  contactId: string;
  contactEmail: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
