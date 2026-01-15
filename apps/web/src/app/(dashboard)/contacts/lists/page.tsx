'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Users, MoreHorizontal, Pencil, Trash2, List, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { contactsApi, ContactList } from '@/lib/api/contacts';

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

function ListCard({ list, onDelete }: { list: ContactList; onDelete: (id: string) => void }) {
  const router = useRouter();
  const color = list.color || '#6b7280';

  return (
    <Card
      className="group cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => router.push(`/contacts/lists/${list.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}20` }}
            >
              <List className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <CardTitle className="text-base">{list.name}</CardTitle>
              {list.description && (
                <CardDescription className="mt-0.5 line-clamp-1">
                  {list.description}
                </CardDescription>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/contacts/lists/${list.id}`);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit List
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(list.id);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete List
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" />
            <span>{list.contactCount.toLocaleString()} contacts</span>
          </div>
          <Badge variant="outline" className="capitalize">
            {list.type}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function ListCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContactListsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteListId, setDeleteListId] = useState<string | null>(null);

  // Fetch lists
  const { data: lists, isLoading } = useQuery({
    queryKey: ['contact-lists'],
    queryFn: () => contactsApi.getLists(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      toast.success('List deleted successfully');
      setDeleteListId(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete list');
    },
  });

  // Filter lists by search
  const filteredLists = lists?.filter(
    (list) =>
      list.name.toLowerCase().includes(search.toLowerCase()) ||
      list.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const totalContacts = lists?.reduce((sum, list) => sum + list.contactCount, 0) || 0;
  const staticLists = lists?.filter((l) => l.type === 'static').length || 0;
  const dynamicLists = lists?.filter((l) => l.type === 'dynamic').length || 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contact Lists</h1>
          <p className="text-muted-foreground">
            Organize your contacts into lists for targeted campaigns
          </p>
        </div>
        <Button asChild>
          <Link href="/contacts/lists/new">
            <Plus className="mr-2 h-4 w-4" />
            Create List
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-blue-100 p-3 text-blue-600">
                <List className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Lists</p>
                <p className="text-2xl font-bold">{lists?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-green-100 p-3 text-green-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Total Contacts</p>
                <p className="text-2xl font-bold">{totalContacts.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-purple-100 p-3 text-purple-600">
                <List className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Static Lists</p>
                <p className="text-2xl font-bold">{staticLists}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-amber-100 p-3 text-amber-600">
                <List className="h-5 w-5" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Dynamic Lists</p>
                <p className="text-2xl font-bold">{dynamicLists}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search lists..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Lists Grid */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ListCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredLists && filteredLists.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLists.map((list) => (
            <ListCard key={list.id} list={list} onDelete={setDeleteListId} />
          ))}
        </div>
      ) : (
        <Card className="py-12">
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="bg-muted rounded-full p-4">
              <List className="text-muted-foreground h-8 w-8" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No lists found</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {search
                ? 'Try adjusting your search term'
                : 'Create your first list to organize contacts'}
            </p>
            {!search && (
              <Button asChild className="mt-4">
                <Link href="/contacts/lists/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create List
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteListId} onOpenChange={() => setDeleteListId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this list. Contacts in the list will not be deleted, only
              removed from this list. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteListId && deleteMutation.mutate(deleteListId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
