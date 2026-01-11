'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { contactsApi, Contact, ContactList, UpdateContactListData } from '@/lib/api/contacts';

// Predefined colors for lists
const listColors = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#6b7280', label: 'Gray' },
];

export default function ListDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const listId = params.id as string;

  // State
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<UpdateContactListData>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedContactsToRemove, setSelectedContactsToRemove] = useState<string[]>([]);
  const [selectedContactsToAdd, setSelectedContactsToAdd] = useState<string[]>([]);
  const [showAddContactsDialog, setShowAddContactsDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [addContactSearch, setAddContactSearch] = useState('');
  const [debouncedAddSearch, setDebouncedAddSearch] = useState('');

  // Debounce the main search to prevent excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Debounce the add contact search to prevent excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAddSearch(addContactSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [addContactSearch]);

  // Fetch list
  const { data: list, isLoading: listLoading } = useQuery({
    queryKey: ['contact-list', listId],
    queryFn: () => contactsApi.getList(listId),
    enabled: !!listId,
  });

  // Fetch list contacts (uses debounced search)
  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: ['list-contacts', listId, page, debouncedSearch],
    queryFn: () =>
      contactsApi.getListContacts(listId, {
        page,
        limit: 20,
        search: debouncedSearch || undefined,
      }),
    enabled: !!listId,
  });

  // Fetch all contacts for add dialog (uses debounced search)
  const { data: allContactsData, isLoading: addContactsLoading } = useQuery({
    queryKey: ['contacts-for-add', debouncedAddSearch],
    queryFn: () =>
      contactsApi.getContacts({
        limit: 50,
        search: debouncedAddSearch || undefined,
      }),
    enabled: showAddContactsDialog,
  });

  // Update list mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateContactListData) => contactsApi.updateList(listId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-list', listId] });
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success('List updated successfully');
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update list');
    },
  });

  // Add contacts mutation
  const addContactsMutation = useMutation({
    mutationFn: (contactIds: string[]) => contactsApi.addContactsToList(listId, contactIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contact-list', listId] });
      queryClient.invalidateQueries({ queryKey: ['list-contacts', listId] });
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success(`${result.added} contact(s) added to list`);
      setShowAddContactsDialog(false);
      setSelectedContactsToAdd([]);
      setAddContactSearch('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add contacts');
    },
  });

  // Remove contacts mutation
  const removeContactsMutation = useMutation({
    mutationFn: (contactIds: string[]) => contactsApi.removeContactsFromList(listId, contactIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['contact-list', listId] });
      queryClient.invalidateQueries({ queryKey: ['list-contacts', listId] });
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success(`${result.removed} contact(s) removed from list`);
      setShowRemoveDialog(false);
      setSelectedContactsToRemove([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to remove contacts');
    },
  });

  // Delete list mutation
  const deleteMutation = useMutation({
    mutationFn: () => contactsApi.deleteList(listId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success('List deleted successfully');
      router.push('/contacts/lists');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete list');
    },
  });

  const handleStartEdit = () => {
    if (list) {
      setEditData({
        name: list.name,
        description: list.description || '',
        color: list.color || '#6b7280',
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = () => {
    updateMutation.mutate(editData);
  };

  const handleSelectAllToRemove = () => {
    if (contactsData?.data) {
      if (selectedContactsToRemove.length === contactsData.data.length) {
        setSelectedContactsToRemove([]);
      } else {
        setSelectedContactsToRemove(contactsData.data.map((c) => c.id));
      }
    }
  };

  const handleSelectContactToRemove = (contactId: string) => {
    setSelectedContactsToRemove((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  const handleSelectContactToAdd = (contactId: string) => {
    setSelectedContactsToAdd((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId]
    );
  };

  // Get contacts not already in list for add dialog
  const contactsNotInList =
    allContactsData?.data.filter(
      (contact) => !contactsData?.data.find((c) => c.id === contact.id)
    ) || [];

  if (listLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <h2 className="text-lg font-semibold">List not found</h2>
        <p className="text-muted-foreground mb-4">
          The list you're looking for doesn't exist or has been deleted.
        </p>
        <Button onClick={() => router.push('/contacts/lists')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Lists
        </Button>
      </div>
    );
  }

  const color = list.color || '#6b7280';

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/contacts/lists')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {isEditing ? (
            <div className="space-y-4">
              <Input
                value={editData.name || ''}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="text-lg font-bold"
                placeholder="List name"
              />
              <Textarea
                value={editData.description || ''}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
              />
              <div className="flex gap-2">
                {listColors.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setEditData({ ...editData, color: c.value })}
                    className={cn(
                      'relative h-8 w-8 rounded-full transition-transform hover:scale-110',
                      editData.color === c.value && 'ring-2 ring-current ring-offset-2'
                    )}
                    style={{ backgroundColor: c.value, color: c.value }}
                  >
                    {editData.color === c.value && (
                      <Check className="absolute inset-0 m-auto h-4 w-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${color}20` }}
              >
                <Users className="h-6 w-6" style={{ color }} />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{list.name}</h1>
                {list.description && <p className="text-muted-foreground">{list.description}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleStartEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this list?')) {
                        deleteMutation.mutate();
                      }
                    }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete List
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Contacts</p>
                <p className="text-2xl font-bold">{list.contactCount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-100 p-3 text-purple-600">
                <Badge variant="outline" className="capitalize">
                  {list.type}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground text-sm">List Type</p>
                <p className="text-lg font-medium capitalize">{list.type}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg" style={{ backgroundColor: color }} />
              <div>
                <p className="text-muted-foreground text-sm">Created</p>
                <p className="text-lg font-medium">
                  {new Date(list.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Contacts in List</CardTitle>
              <CardDescription>
                {contactsData?.meta.total || 0} contacts in this list
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {selectedContactsToRemove.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowRemoveDialog(true)}>
                  <UserMinus className="mr-2 h-4 w-4" />
                  Remove ({selectedContactsToRemove.length})
                </Button>
              )}
              <Button size="sm" onClick={() => setShowAddContactsDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Contacts
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-4 max-w-sm">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search contacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Table */}
          {contactsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : contactsData?.data && contactsData.data.length > 0 ? (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            contactsData.data.length > 0 &&
                            selectedContactsToRemove.length === contactsData.data.length
                          }
                          onCheckedChange={handleSelectAllToRemove}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactsData.data.map((contact) => (
                      <TableRow
                        key={contact.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/contacts/${contact.id}`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedContactsToRemove.includes(contact.id)}
                            onCheckedChange={() => handleSelectContactToRemove(contact.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {contact.firstName || contact.lastName
                            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                            : '-'}
                        </TableCell>
                        <TableCell>{contact.email || '-'}</TableCell>
                        <TableCell>{contact.phone || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'capitalize',
                              contact.status === 'active' && 'bg-green-100 text-green-700',
                              contact.status === 'unsubscribed' && 'bg-yellow-100 text-yellow-700',
                              contact.status === 'bounced' && 'bg-red-100 text-red-700'
                            )}
                          >
                            {contact.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {contactsData.meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-muted-foreground text-sm">
                    Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, contactsData.meta.total)}{' '}
                    of {contactsData.meta.total}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= contactsData.meta.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center">
              <Users className="text-muted-foreground mx-auto h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">No contacts in this list</h3>
              <p className="text-muted-foreground mt-1 text-sm">Add contacts to get started</p>
              <Button className="mt-4" onClick={() => setShowAddContactsDialog(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Contacts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Contacts Dialog */}
      <Dialog open={showAddContactsDialog} onOpenChange={setShowAddContactsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Contacts to List</DialogTitle>
            <DialogDescription>Select contacts to add to "{list.name}"</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search contacts..."
                value={addContactSearch}
                onChange={(e) => setAddContactSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-96 overflow-y-auto rounded-md border">
              {addContactsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                </div>
              ) : contactsNotInList.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactsNotInList.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedContactsToAdd.includes(contact.id)}
                            onCheckedChange={() => handleSelectContactToAdd(contact.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {contact.firstName || contact.lastName
                            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                            : '-'}
                        </TableCell>
                        <TableCell>{contact.email || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-muted-foreground py-8 text-center">
                  No contacts found to add
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddContactsDialog(false);
                setSelectedContactsToAdd([]);
                setAddContactSearch('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addContactsMutation.mutate(selectedContactsToAdd)}
              disabled={selectedContactsToAdd.length === 0 || addContactsMutation.isPending}
            >
              {addContactsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add {selectedContactsToAdd.length} Contact(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Contacts Confirmation */}
      <AlertDialog open={showRemoveDialog} onOpenChange={setShowRemoveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {selectedContactsToRemove.length} contact(s) from this list. The
              contacts themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeContactsMutation.mutate(selectedContactsToRemove)}
              disabled={removeContactsMutation.isPending}
            >
              {removeContactsMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
