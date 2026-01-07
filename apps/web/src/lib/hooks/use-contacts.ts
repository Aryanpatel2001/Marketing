'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  contactsApi,
  ContactsQuery,
  CreateContactData,
  UpdateContactData,
} from '@/lib/api/contacts';
import { getErrorMessage } from '@/lib/api/client';

// Query keys
export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (query?: ContactsQuery) => [...contactKeys.lists(), query] as const,
  details: () => [...contactKeys.all, 'detail'] as const,
  detail: (id: string) => [...contactKeys.details(), id] as const,
  contactLists: ['contactLists'] as const,
  tags: ['contactTags'] as const,
};

export function useContacts(query?: ContactsQuery) {
  return useQuery({
    queryKey: contactKeys.list(query),
    queryFn: () => contactsApi.getContacts(query),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useContact(id: string) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.getContact(id),
    enabled: !!id,
  });
}

export function useContactLists() {
  return useQuery({
    queryKey: contactKeys.contactLists,
    queryFn: contactsApi.getLists,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Tags endpoint doesn't exist yet - this is a placeholder for future implementation
// export function useContactTags() {
//   return useQuery({
//     queryKey: contactKeys.tags,
//     queryFn: contactsApi.getTags,
//     staleTime: 5 * 60 * 1000, // 5 minutes
//   });
// }

export function useCreateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateContactData) => contactsApi.createContact(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success('Contact created successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateContactData }) =>
      contactsApi.updateContact(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) });
      toast.success('Contact updated successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contactsApi.deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success('Contact deleted successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useDeleteContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => contactsApi.bulkDeleteContacts(ids),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      toast.success(`${result.deleted} contacts deleted successfully`);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useImportContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      contacts: Record<string, unknown>[];
      duplicateHandling: 'skip' | 'update' | 'create_new';
      duplicateCheckField: 'email' | 'phone' | 'both';
      updateExistingTags?: boolean;
    }) => contactsApi.importContacts(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: contactKeys.lists() });
      const message = `Imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`;
      toast.success(message);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useExportContacts() {
  return useMutation({
    mutationFn: (query?: ContactsQuery) => contactsApi.exportContacts(query),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Contacts exported successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

// Contact List mutations
export function useCreateContactList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string }) => contactsApi.createList(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.contactLists });
      toast.success('List created successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useUpdateContactList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string } }) =>
      contactsApi.updateList(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.contactLists });
      toast.success('List updated successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}

export function useDeleteContactList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => contactsApi.deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contactKeys.contactLists });
      toast.success('List deleted successfully');
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
    },
  });
}
