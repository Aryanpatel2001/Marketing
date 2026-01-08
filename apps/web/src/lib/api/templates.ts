import { apiClient } from './client';
import type { PaginatedResponse } from './contacts';

// ==================== TYPES ====================

export type TemplateType = 'email' | 'sms' | 'whatsapp';
export type TemplateStatus = 'draft' | 'active' | 'archived';

export interface Template {
  id: string;
  tenantId: string;
  name: string;
  type: TemplateType;
  categoryId: string | null;
  subject: string | null;
  content: string | null;
  designJson: Record<string, unknown> | null;
  plainText: string | null;
  variables: string[];
  thumbnailUrl: string | null;
  status: TemplateStatus;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  category?: TemplateCategory | null;
}

export interface TemplateCategory {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatesQuery {
  page?: number;
  limit?: number;
  search?: string;
  type?: TemplateType;
  categoryId?: string;
  status?: TemplateStatus;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateTemplateData {
  name: string;
  type: TemplateType;
  categoryId?: string;
  subject?: string;
  content?: string;
  designJson?: Record<string, unknown>;
  plainText?: string;
  status?: TemplateStatus;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {}

export interface CreateTemplateCategoryData {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}

export interface UpdateTemplateCategoryData extends Partial<CreateTemplateCategoryData> {}

export interface TemplateStats {
  total: number;
  byType: Record<TemplateType, number>;
  byStatus: Record<TemplateStatus, number>;
}

export interface PreviewData {
  subject: string | null;
  content: string | null;
  plainText: string | null;
}

// ==================== API ====================

export const templatesApi = {
  // ==================== TEMPLATES ====================

  getTemplates: async (query?: TemplatesQuery): Promise<PaginatedResponse<Template>> => {
    const response = await apiClient.get<PaginatedResponse<Template>>('/templates', {
      params: query,
    });
    return response.data;
  },

  getTemplate: async (id: string): Promise<Template> => {
    console.log('[API] Fetching template:', id);
    const response = await apiClient.get<Template>(`/templates/${id}`);
    console.log('[API] Template fetched:', {
      id: response.data.id,
      name: response.data.name,
      type: response.data.type,
      hasDesignJson: !!response.data.designJson,
      designJsonKeys: response.data.designJson ? Object.keys(response.data.designJson) : [],
      designJsonPreview: response.data.designJson
        ? JSON.stringify(response.data.designJson).substring(0, 200)
        : null,
    });
    return response.data;
  },

  createTemplate: async (data: CreateTemplateData): Promise<Template> => {
    console.log('[API] Creating template with data:', {
      name: data.name,
      type: data.type,
      hasDesignJson: !!data.designJson,
      designJsonKeys: data.designJson ? Object.keys(data.designJson) : [],
    });
    const response = await apiClient.post<Template>('/templates', data);
    console.log('[API] Template created, response:', {
      id: response.data.id,
      hasDesignJson: !!response.data.designJson,
      designJsonKeys: response.data.designJson ? Object.keys(response.data.designJson) : [],
    });
    return response.data;
  },

  updateTemplate: async (id: string, data: UpdateTemplateData): Promise<Template> => {
    const response = await apiClient.put<Template>(`/templates/${id}`, data);
    return response.data;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/templates/${id}`);
  },

  duplicateTemplate: async (id: string, name?: string): Promise<Template> => {
    const response = await apiClient.post<Template>(`/templates/${id}/duplicate`, { name });
    return response.data;
  },

  previewTemplate: async (id: string, sampleData: Record<string, string>): Promise<PreviewData> => {
    const response = await apiClient.post<PreviewData>(`/templates/${id}/preview`, sampleData);
    return response.data;
  },

  getStats: async (): Promise<TemplateStats> => {
    const response = await apiClient.get<TemplateStats>('/templates/stats');
    return response.data;
  },

  uploadThumbnail: async (
    templateId: string,
    imageDataUrl: string
  ): Promise<{ thumbnailUrl: string }> => {
    console.log('[API] Uploading thumbnail for template:', templateId);
    const response = await apiClient.post<{ thumbnailUrl: string }>('/templates/upload-thumbnail', {
      templateId,
      image: imageDataUrl,
    });
    console.log('[API] Thumbnail uploaded:', response.data.thumbnailUrl);
    return response.data;
  },

  // ==================== CATEGORIES ====================

  getCategories: async (): Promise<TemplateCategory[]> => {
    const response = await apiClient.get<TemplateCategory[]>('/templates/categories');
    return response.data;
  },

  getCategory: async (id: string): Promise<TemplateCategory> => {
    const response = await apiClient.get<TemplateCategory>(`/templates/categories/${id}`);
    return response.data;
  },

  createCategory: async (data: CreateTemplateCategoryData): Promise<TemplateCategory> => {
    const response = await apiClient.post<TemplateCategory>('/templates/categories', data);
    return response.data;
  },

  updateCategory: async (
    id: string,
    data: UpdateTemplateCategoryData
  ): Promise<TemplateCategory> => {
    const response = await apiClient.put<TemplateCategory>(`/templates/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/templates/categories/${id}`);
  },
};
