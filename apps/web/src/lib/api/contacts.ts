import { apiClient } from './client';

// ==================== TYPES ====================

export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained';
export type ContactSource = 'manual' | 'import' | 'api' | 'form';
export type ChannelStatus = 'active' | 'unsubscribed' | 'bounced';
export type ListType = 'static' | 'dynamic';

export interface Contact {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  whatsappNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  customFields: Record<string, unknown>;
  tags: string[];
  source: ContactSource;
  status: ContactStatus;
  emailStatus: ChannelStatus;
  smsStatus: ChannelStatus;
  whatsappStatus: ChannelStatus;
  engagementScore: number;
  lastActivityAt: string | null;
  lastEmailSentAt: string | null;
  lastEmailOpenedAt: string | null;
  lastEmailClickedAt: string | null;
  totalEmailsSent: number;
  totalEmailsOpened: number;
  totalEmailsClicked: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fullName?: string;
}

export interface ContactList {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  type: ListType;
  filterCriteria: Record<string, unknown> | null;
  contactCount: number;
  color: string | null;
  isDefault: boolean;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: ContactStatus;
  source?: ContactSource;
  emailStatus?: ChannelStatus;
  smsStatus?: ChannelStatus;
  tags?: string[];
  listId?: string;
  country?: string;
  city?: string;
  hasEmail?: boolean;
  hasPhone?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface CreateContactData {
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  jobTitle?: string;
  website?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  source?: ContactSource;
  status?: ContactStatus;
  notes?: string;
  listIds?: string[];
}

export interface UpdateContactData extends Partial<CreateContactData> {}

export interface CreateContactListData {
  name: string;
  description?: string;
  type?: ListType;
  filterCriteria?: Record<string, unknown>;
  color?: string;
}

export interface UpdateContactListData extends Partial<CreateContactListData> {}

export interface ContactStats {
  total: number;
  active: number;
  unsubscribed: number;
  bounced: number;
  bySource: Record<string, number>;
}

// ==================== API ====================

export const contactsApi = {
  // ==================== CONTACTS ====================

  getContacts: async (query?: ContactsQuery): Promise<PaginatedResponse<Contact>> => {
    const params = { ...query };
    if (params.tags && Array.isArray(params.tags)) {
      (params as Record<string, unknown>).tags = params.tags.join(',');
    }
    const response = await apiClient.get<PaginatedResponse<Contact>>('/contacts', { params });
    return response.data;
  },

  getContact: async (id: string): Promise<Contact> => {
    const response = await apiClient.get<Contact>(`/contacts/${id}`);
    return response.data;
  },

  createContact: async (data: CreateContactData): Promise<Contact> => {
    const response = await apiClient.post<Contact>('/contacts', data);
    return response.data;
  },

  updateContact: async (id: string, data: UpdateContactData): Promise<Contact> => {
    const response = await apiClient.put<Contact>(`/contacts/${id}`, data);
    return response.data;
  },

  deleteContact: async (id: string): Promise<void> => {
    await apiClient.delete(`/contacts/${id}`);
  },

  bulkDeleteContacts: async (ids: string[]): Promise<{ deleted: number }> => {
    const response = await apiClient.post<{ deleted: number }>('/contacts/bulk/delete', { ids });
    return response.data;
  },

  bulkUpdateContacts: async (data: {
    ids: string[];
    addTags?: string[];
    removeTags?: string[];
    status?: ContactStatus;
  }): Promise<{ updated: number }> => {
    const response = await apiClient.post<{ updated: number }>('/contacts/bulk/update', data);
    return response.data;
  },

  addTags: async (id: string, tags: string[]): Promise<Contact> => {
    const response = await apiClient.post<Contact>(`/contacts/${id}/tags`, { tags });
    return response.data;
  },

  removeTags: async (id: string, tags: string[]): Promise<Contact> => {
    const response = await apiClient.delete<Contact>(`/contacts/${id}/tags`, { data: { tags } });
    return response.data;
  },

  getStats: async (): Promise<ContactStats> => {
    const response = await apiClient.get<ContactStats>('/contacts/stats');
    return response.data;
  },

  // ==================== CONTACT LISTS ====================

  getLists: async (): Promise<ContactList[]> => {
    const response = await apiClient.get<ContactList[]>('/contacts/lists');
    return response.data;
  },

  getList: async (id: string): Promise<ContactList> => {
    const response = await apiClient.get<ContactList>(`/contacts/lists/${id}`);
    return response.data;
  },

  createList: async (data: CreateContactListData): Promise<ContactList> => {
    const response = await apiClient.post<ContactList>('/contacts/lists', data);
    return response.data;
  },

  updateList: async (id: string, data: UpdateContactListData): Promise<ContactList> => {
    const response = await apiClient.put<ContactList>(`/contacts/lists/${id}`, data);
    return response.data;
  },

  deleteList: async (id: string): Promise<void> => {
    await apiClient.delete(`/contacts/lists/${id}`);
  },

  getListContacts: async (
    listId: string,
    query?: ContactsQuery
  ): Promise<PaginatedResponse<Contact>> => {
    const response = await apiClient.get<PaginatedResponse<Contact>>(
      `/contacts/lists/${listId}/contacts`,
      {
        params: query,
      }
    );
    return response.data;
  },

  addContactsToList: async (listId: string, contactIds: string[]): Promise<{ added: number }> => {
    const response = await apiClient.post<{ added: number }>(`/contacts/lists/${listId}/contacts`, {
      contactIds,
    });
    return response.data;
  },

  removeContactsFromList: async (
    listId: string,
    contactIds: string[]
  ): Promise<{ removed: number }> => {
    const response = await apiClient.delete<{ removed: number }>(
      `/contacts/lists/${listId}/contacts`,
      {
        data: { contactIds },
      }
    );
    return response.data;
  },

  // ==================== IMPORT/EXPORT ====================

  importContacts: async (data: {
    contacts: Record<string, unknown>[];
    duplicateHandling: 'skip' | 'update' | 'create_new';
    duplicateCheckField: 'email' | 'phone' | 'both';
    updateExistingTags?: boolean;
  }): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors?: Array<{ index: number; message: string }>;
  }> => {
    const response = await apiClient.post<{
      created: number;
      updated: number;
      skipped: number;
      errors?: Array<{ index: number; message: string }>;
    }>('/contacts/import', data);
    return response.data;
  },

  exportContacts: async (query?: ContactsQuery): Promise<Blob> => {
    const params = { ...query };
    if (params.tags && Array.isArray(params.tags)) {
      (params as Record<string, unknown>).tags = params.tags.join(',');
    }
    const response = await apiClient.get('/contacts/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // ==================== SERVER-SIDE IMPORT ====================

  uploadImportFile: async (file: File): Promise<ImportUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post<ImportUploadResponse>(
      '/contacts/import/upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  startImportJob: async (data: StartImportJobData): Promise<ImportJob> => {
    const response = await apiClient.post<ImportJob>('/contacts/import/start', data);
    return response.data;
  },

  getImportJobStatus: async (jobId: string): Promise<ImportJob> => {
    const response = await apiClient.get<ImportJob>(`/contacts/import/${jobId}/status`);
    return response.data;
  },

  downloadImportErrors: async (jobId: string): Promise<Blob> => {
    const response = await apiClient.get(`/contacts/import/${jobId}/errors`, {
      responseType: 'blob',
    });
    return response.data;
  },

  cancelImportJob: async (jobId: string): Promise<void> => {
    await apiClient.post(`/contacts/import/${jobId}/cancel`);
  },

  getImportHistory: async (params?: { limit?: number; offset?: number }): Promise<ImportJob[]> => {
    const response = await apiClient.get<ImportJob[]>('/contacts/imports/history', { params });
    return response.data;
  },
};

// ==================== IMPORT TYPES ====================

export type ImportJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type DuplicateHandling = 'skip' | 'update' | 'create_new';

export interface ImportUploadResponse {
  fileId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  headers: string[];
  previewData: Record<string, string>[];
  totalRows: number;
}

export interface StartImportJobData {
  fileId: string;
  filePath: string;
  fileSize: number;
  totalRows: number;
  fieldMapping: Record<string, string>;
  duplicateHandling: DuplicateHandling;
  duplicateCheckField: string;
}

export interface ImportJob {
  id: string;
  tenantId: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  status: ImportJobStatus;
  duplicateHandling: DuplicateHandling;
  duplicateCheckField: string;
  fieldMapping: Record<string, string>;
  errors: Array<{ row: number; message: string }>;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportProgressEvent {
  jobId: string;
  status: ImportJobStatus;
  processedRows: number;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  currentBatch: number;
  totalBatches: number;
  message: string;
  progress: number;
}
