import { apiClient } from './client';

export interface Contact {
  id: string;
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, unknown>;
  tags: string[];
  status: 'active' | 'unsubscribed' | 'bounced' | 'complained';
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactList {
  id: string;
  name: string;
  description?: string;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: Contact['status'];
  tags?: string[];
  listId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface CreateContactData {
  email: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  customFields?: Record<string, unknown>;
  tags?: string[];
  listIds?: string[];
}

export interface UpdateContactData extends Partial<CreateContactData> {}

export interface ImportContactsData {
  listId?: string;
  file: File;
  mappings: {
    email: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    [key: string]: string | undefined;
  };
}

export const contactsApi = {
  // Contacts
  getContacts: async (query?: ContactsQuery): Promise<PaginatedResponse<Contact>> => {
    const response = await apiClient.get<{ data: PaginatedResponse<Contact> }>('/contacts', {
      params: query,
    });
    return response.data.data;
  },

  getContact: async (id: string): Promise<Contact> => {
    const response = await apiClient.get<{ data: Contact }>(`/contacts/${id}`);
    return response.data.data;
  },

  createContact: async (data: CreateContactData): Promise<Contact> => {
    const response = await apiClient.post<{ data: Contact }>('/contacts', data);
    return response.data.data;
  },

  updateContact: async (id: string, data: UpdateContactData): Promise<Contact> => {
    const response = await apiClient.patch<{ data: Contact }>(`/contacts/${id}`, data);
    return response.data.data;
  },

  deleteContact: async (id: string): Promise<void> => {
    await apiClient.delete(`/contacts/${id}`);
  },

  deleteContacts: async (ids: string[]): Promise<void> => {
    await apiClient.post('/contacts/bulk-delete', { ids });
  },

  importContacts: async (data: FormData): Promise<{ imported: number; errors: number }> => {
    const response = await apiClient.post<{
      data: { imported: number; errors: number };
    }>('/contacts/import', data, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  exportContacts: async (query?: ContactsQuery): Promise<Blob> => {
    const response = await apiClient.get('/contacts/export', {
      params: query,
      responseType: 'blob',
    });
    return response.data;
  },

  // Contact Lists
  getLists: async (): Promise<ContactList[]> => {
    const response = await apiClient.get<{ data: ContactList[] }>('/contacts/lists');
    return response.data.data;
  },

  getList: async (id: string): Promise<ContactList> => {
    const response = await apiClient.get<{ data: ContactList }>(`/contacts/lists/${id}`);
    return response.data.data;
  },

  createList: async (data: { name: string; description?: string }): Promise<ContactList> => {
    const response = await apiClient.post<{ data: ContactList }>('/contacts/lists', data);
    return response.data.data;
  },

  updateList: async (
    id: string,
    data: { name?: string; description?: string }
  ): Promise<ContactList> => {
    const response = await apiClient.patch<{ data: ContactList }>(`/contacts/lists/${id}`, data);
    return response.data.data;
  },

  deleteList: async (id: string): Promise<void> => {
    await apiClient.delete(`/contacts/lists/${id}`);
  },

  addContactsToList: async (listId: string, contactIds: string[]): Promise<void> => {
    await apiClient.post(`/contacts/lists/${listId}/contacts`, { contactIds });
  },

  removeContactsFromList: async (listId: string, contactIds: string[]): Promise<void> => {
    await apiClient.delete(`/contacts/lists/${listId}/contacts`, {
      data: { contactIds },
    });
  },

  // Tags
  getTags: async (): Promise<string[]> => {
    const response = await apiClient.get<{ data: string[] }>('/contacts/tags');
    return response.data.data;
  },
};
