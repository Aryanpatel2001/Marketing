'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  SlidersHorizontal,
  MoreHorizontal,
  Trash2,
  Edit,
  Mail,
  Phone,
  MessageCircle,
  Download,
  Upload,
  Loader2,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Tag,
  Building2,
  TrendingUp,
  List,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmationDialog } from '@/components/common/confirmation-dialog';
import { cn } from '@/lib/utils';

import {
  contactsApi,
  Contact,
  ContactsQuery,
  ContactStatus,
  ContactSource,
} from '@/lib/api/contacts';

// Avatar colors based on first letter
const avatarColors: Record<string, string> = {
  A: 'from-rose-500 to-pink-600',
  B: 'from-orange-500 to-amber-600',
  C: 'from-amber-500 to-yellow-600',
  D: 'from-lime-500 to-green-600',
  E: 'from-emerald-500 to-teal-600',
  F: 'from-teal-500 to-cyan-600',
  G: 'from-cyan-500 to-sky-600',
  H: 'from-sky-500 to-blue-600',
  I: 'from-blue-500 to-indigo-600',
  J: 'from-indigo-500 to-violet-600',
  K: 'from-violet-500 to-purple-600',
  L: 'from-purple-500 to-fuchsia-600',
  M: 'from-fuchsia-500 to-pink-600',
  N: 'from-pink-500 to-rose-600',
  O: 'from-red-500 to-orange-600',
  P: 'from-orange-400 to-amber-500',
  Q: 'from-yellow-500 to-lime-600',
  R: 'from-green-500 to-emerald-600',
  S: 'from-teal-400 to-cyan-500',
  T: 'from-blue-400 to-indigo-500',
  U: 'from-indigo-400 to-violet-500',
  V: 'from-violet-400 to-purple-500',
  W: 'from-purple-400 to-fuchsia-500',
  X: 'from-fuchsia-400 to-pink-500',
  Y: 'from-pink-400 to-rose-500',
  Z: 'from-rose-400 to-red-500',
};

function getAvatarGradient(name: string): string {
  const firstChar = (name || 'U').charAt(0).toUpperCase();
  return avatarColors[firstChar] || 'from-gray-500 to-slate-600';
}

function getInitials(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null
): string {
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }
  if (firstName) return firstName.charAt(0).toUpperCase();
  if (lastName) return lastName.charAt(0).toUpperCase();
  if (email) return email.charAt(0).toUpperCase();
  return 'U';
}

function ContactAvatar({ contact }: { contact: Contact }) {
  const initials = getInitials(contact.firstName, contact.lastName, contact.email);
  const gradient = getAvatarGradient(contact.firstName || contact.lastName || contact.email || 'U');

  return (
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-md',
        gradient
      )}
    >
      {initials}
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  trend?: string;
}

function StatCard({ title, value, icon: Icon, gradient, iconBg, trend }: StatCardProps) {
  return (
    <div
      className={cn(
        'relative cursor-default overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl',
        'border border-white/10 bg-gradient-to-br shadow-lg',
        gradient
      )}
    >
      <div className="absolute -right-4 -top-4 opacity-10">
        <Icon className="h-24 w-24" />
      </div>
      <div className="relative z-10">
        <div
          className={cn(
            'mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl',
            iconBg
          )}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="mb-1 text-3xl font-bold text-white">{value.toLocaleString()}</div>
        <div className="text-sm font-medium text-white/80">{title}</div>
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs text-white/70">
            <TrendingUp className="h-3 w-3" />
            {trend}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ContactStatus }) {
  const config: Record<
    ContactStatus,
    { label: string; className: string; icon: React.ElementType }
  > = {
    active: {
      label: 'Active',
      className:
        'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400',
      icon: UserCheck,
    },
    unsubscribed: {
      label: 'Unsubscribed',
      className:
        'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/20 dark:text-amber-400',
      icon: UserX,
    },
    bounced: {
      label: 'Bounced',
      className:
        'bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/20 dark:text-red-400',
      icon: AlertTriangle,
    },
    complained: {
      label: 'Complained',
      className:
        'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:bg-rose-500/20 dark:text-rose-400',
      icon: AlertTriangle,
    },
  };

  const { label, className, icon: StatusIcon } = config[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        className
      )}
    >
      <StatusIcon className="h-3 w-3" />
      {label}
    </span>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function EmptyStateIllustration() {
  return (
    <div className="relative mx-auto mb-6 h-48 w-48">
      {/* Background circles */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="from-primary/5 to-primary/10 h-40 w-40 animate-pulse rounded-full bg-gradient-to-br" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="from-primary/10 to-primary/20 h-32 w-32 rounded-full bg-gradient-to-br" />
      </div>
      {/* Main icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="from-primary to-primary/80 flex h-20 w-20 rotate-6 transform items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg transition-transform duration-500 hover:rotate-0">
          <Users className="h-10 w-10 text-white" />
        </div>
      </div>
      {/* Floating elements */}
      <div
        className="absolute right-8 top-4 flex h-8 w-8 animate-bounce items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-md"
        style={{ animationDelay: '0.2s' }}
      >
        <Mail className="h-4 w-4 text-white" />
      </div>
      <div
        className="absolute bottom-8 left-6 flex h-6 w-6 animate-bounce items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-md"
        style={{ animationDelay: '0.4s' }}
      >
        <Phone className="h-3 w-3 text-white" />
      </div>
      <div className="absolute left-4 top-1/2 h-4 w-4 animate-pulse rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-sm" />
    </div>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContactStatus | 'all'>('all');
  const [sourceFilter, setSourceFilter] = useState<ContactSource | 'all'>('all');
  const [hasEmailFilter, setHasEmailFilter] = useState<boolean | undefined>();
  const [hasPhoneFilter, setHasPhoneFilter] = useState<boolean | undefined>();
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);

  // Active filters count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count++;
    if (sourceFilter !== 'all') count++;
    if (hasEmailFilter !== undefined) count++;
    if (hasPhoneFilter !== undefined) count++;
    return count;
  }, [statusFilter, sourceFilter, hasEmailFilter, hasPhoneFilter]);

  // Build query params
  const queryParams: ContactsQuery = {
    page,
    limit: 20,
    search: search || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    source: sourceFilter !== 'all' ? sourceFilter : undefined,
    hasEmail: hasEmailFilter,
    hasPhone: hasPhoneFilter,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };

  // Fetch contacts
  const {
    data,
    isLoading,
    isError: isContactsError,
  } = useQuery({
    queryKey: ['contacts', queryParams],
    queryFn: () => contactsApi.getContacts(queryParams),
  });

  // Fetch stats
  const { data: stats, isError: isStatsError } = useQuery({
    queryKey: ['contacts-stats'],
    queryFn: () => contactsApi.getStats(),
  });

  // Show error toast if queries fail
  useEffect(() => {
    if (isContactsError) {
      toast.error('Failed to load contacts');
    }
  }, [isContactsError]);

  useEffect(() => {
    if (isStatsError) {
      toast.error('Failed to load statistics');
    }
  }, [isStatsError]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => contactsApi.deleteContact(id),
    onSuccess: () => {
      toast.success('Contact deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-stats'] });
      setContactToDelete(null);
      setDeleteDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to delete contact');
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => contactsApi.bulkDeleteContacts(ids),
    onSuccess: (result) => {
      toast.success(`${result.deleted} contacts deleted`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contacts-stats'] });
      setSelectedIds([]);
      setDeleteDialogOpen(false);
    },
    onError: () => {
      toast.error('Failed to delete contacts');
    },
  });

  const contacts = data?.data || [];
  const meta = data?.meta;

  const toggleSelectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map((c) => c.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleDelete = () => {
    if (contactToDelete) {
      deleteMutation.mutate(contactToDelete);
    } else if (selectedIds.length > 0) {
      bulkDeleteMutation.mutate(selectedIds);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const blob = await contactsApi.exportContacts({
        search: search || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contacts_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Contacts exported successfully');
    } catch {
      toast.error('Failed to export contacts');
    } finally {
      setIsExporting(false);
    }
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setSourceFilter('all');
    setHasEmailFilter(undefined);
    setHasPhoneFilter(undefined);
    setPage(1);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Generate pagination numbers
  const paginationNumbers = useMemo(() => {
    if (!meta) return [];
    const totalPages = meta.totalPages;
    const current = page;
    const delta = 2;
    const range: (number | 'ellipsis')[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= current - delta && i <= current + delta)) {
        range.push(i);
      } else if (range[range.length - 1] !== 'ellipsis') {
        range.push('ellipsis');
      }
    }

    return range;
  }, [meta, page]);

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <div className="from-primary to-primary/80 rounded-xl bg-gradient-to-br p-2.5 shadow-lg">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
              <p className="text-muted-foreground text-sm">
                Manage your audience of {stats?.total?.toLocaleString() || 0} contacts
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/contacts/lists')}
            className="gap-2"
          >
            <List className="h-4 w-4" />
            Lists
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/contacts/import')}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export
          </Button>
          <Button
            size="sm"
            onClick={() => router.push('/contacts/new')}
            className="gap-2 shadow-md"
          >
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Contacts"
          value={stats?.total || 0}
          icon={Users}
          gradient="from-slate-800 to-slate-900 dark:from-slate-700 dark:to-slate-800"
          iconBg="bg-white/10"
        />
        <StatCard
          title="Active"
          value={stats?.active || 0}
          icon={UserCheck}
          gradient="from-emerald-500 to-emerald-700"
          iconBg="bg-white/20"
          trend="+12% this month"
        />
        <StatCard
          title="Unsubscribed"
          value={stats?.unsubscribed || 0}
          icon={UserX}
          gradient="from-amber-500 to-orange-600"
          iconBg="bg-white/20"
        />
        <StatCard
          title="Bounced"
          value={stats?.bounced || 0}
          icon={AlertTriangle}
          gradient="from-red-500 to-rose-600"
          iconBg="bg-white/20"
        />
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex w-full flex-1 gap-3 sm:w-auto">
          {/* Search Input */}
          <div className="relative max-w-md flex-1">
            <Search className="text-muted-foreground absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 h-11 pl-10 focus:ring-2"
            />
          </div>

          {/* Quick Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as ContactStatus | 'all');
              setPage(1);
            }}
          >
            <SelectTrigger className="bg-background/50 h-11 w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="complained">Complained</SelectItem>
            </SelectContent>
          </Select>

          {/* Advanced Filters Sheet */}
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="default" className="relative h-11 gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <span className="bg-primary text-primary-foreground absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-medium">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5" />
                  Advanced Filters
                </SheetTitle>
                <SheetDescription>Refine your contact list with multiple criteria</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-6">
                {/* Status Filter */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as ContactStatus | 'all')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Status</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                      <SelectItem value="complained">Complained</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Source Filter */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Source</Label>
                  <Select
                    value={sourceFilter}
                    onValueChange={(v) => setSourceFilter(v as ContactSource | 'all')}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Source</SelectItem>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                      <SelectItem value="import">CSV Import</SelectItem>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="form">Form Submission</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Channel Filters */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Communication Channels</Label>
                  <div className="space-y-2">
                    <label className="border-border/50 bg-muted/30 hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors">
                      <Checkbox
                        checked={hasEmailFilter === true}
                        onCheckedChange={(checked) => setHasEmailFilter(checked ? true : undefined)}
                      />
                      <Mail className="text-muted-foreground h-4 w-4" />
                      <span className="text-sm">Has email address</span>
                    </label>
                    <label className="border-border/50 bg-muted/30 hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors">
                      <Checkbox
                        checked={hasPhoneFilter === true}
                        onCheckedChange={(checked) => setHasPhoneFilter(checked ? true : undefined)}
                      />
                      <Phone className="text-muted-foreground h-4 w-4" />
                      <span className="text-sm">Has phone number</span>
                    </label>
                  </div>
                </div>
              </div>

              <SheetFooter className="flex gap-2">
                <Button variant="outline" onClick={clearFilters} className="flex-1">
                  Clear All
                </Button>
                <SheetClose asChild>
                  <Button className="flex-1">Apply Filters</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* Selection Actions */}
        {selectedIds.length > 0 && (
          <div className="bg-primary/5 border-primary/20 flex items-center gap-3 rounded-lg border px-4 py-2">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">Active filters:</span>
          {statusFilter !== 'all' && (
            <FilterChip label={`Status: ${statusFilter}`} onRemove={() => setStatusFilter('all')} />
          )}
          {sourceFilter !== 'all' && (
            <FilterChip label={`Source: ${sourceFilter}`} onRemove={() => setSourceFilter('all')} />
          )}
          {hasEmailFilter && (
            <FilterChip label="Has Email" onRemove={() => setHasEmailFilter(undefined)} />
          )}
          {hasPhoneFilter && (
            <FilterChip label="Has Phone" onRemove={() => setHasPhoneFilter(undefined)} />
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
            Clear all
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="border-border/50 bg-card/50 overflow-hidden rounded-xl border shadow-sm backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-12">
                <Checkbox
                  checked={contacts.length > 0 && selectedIds.length === contacts.length}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead className="min-w-[250px]">Contact</TableHead>
              <TableHead>Channels</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Engagement</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8 rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-80">
                  <div className="flex flex-col items-center justify-center py-8">
                    <EmptyStateIllustration />
                    <h3 className="mb-2 text-lg font-semibold">
                      {search || activeFiltersCount > 0 ? 'No contacts found' : 'No contacts yet'}
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-sm text-center text-sm">
                      {search || activeFiltersCount > 0
                        ? "Try adjusting your search or filters to find what you're looking for"
                        : 'Start building your audience by adding your first contact or importing a list'}
                    </p>
                    {!search && activeFiltersCount === 0 && (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={() => router.push('/contacts/import')}
                          className="gap-2"
                        >
                          <Upload className="h-4 w-4" />
                          Import Contacts
                        </Button>
                        <Button onClick={() => router.push('/contacts/new')} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add Contact
                        </Button>
                      </div>
                    )}
                    {(search || activeFiltersCount > 0) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          clearFilters();
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="hover:bg-muted/50 group cursor-pointer transition-colors"
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <ContactAvatar contact={contact} />
                      <div>
                        <div className="text-foreground font-medium">
                          {contact.firstName || contact.lastName
                            ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim()
                            : contact.email || 'Unknown'}
                        </div>
                        <div className="text-muted-foreground flex items-center gap-2 text-sm">
                          {contact.email && (
                            <span className="max-w-[180px] truncate">{contact.email}</span>
                          )}
                          {contact.company && (
                            <>
                              <span className="text-border">•</span>
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {contact.company}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {contact.email && (
                        <div
                          className="rounded-md bg-blue-500/10 p-1.5 text-blue-600 dark:text-blue-400"
                          title="Email"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {contact.phone && (
                        <div
                          className="rounded-md bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400"
                          title="Phone"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {contact.whatsappNumber && (
                        <div
                          className="rounded-md bg-green-500/10 p-1.5 text-green-600 dark:text-green-400"
                          title="WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={contact.status} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 2).map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="bg-muted/50 text-xs font-normal"
                        >
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 2 && (
                        <Badge variant="secondary" className="bg-muted/50 text-xs font-normal">
                          +{contact.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="bg-muted h-1.5 w-12 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                          style={{ width: `${Math.min(contact.engagementScore || 0, 100)}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs font-medium">
                        {contact.engagementScore || 0}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(contact.createdAt)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => router.push(`/contacts/${contact.id}`)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => router.push(`/contacts/${contact.id}/edit`)}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Contact
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Tag className="mr-2 h-4 w-4" />
                          Manage Tags
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            setContactToDelete(contact.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-4 pt-4 sm:flex-row">
          <p className="text-muted-foreground text-sm">
            Showing <span className="text-foreground font-medium">{(page - 1) * 20 + 1}</span> to{' '}
            <span className="text-foreground font-medium">{Math.min(page * 20, meta.total)}</span>{' '}
            of <span className="text-foreground font-medium">{meta.total.toLocaleString()}</span>{' '}
            contacts
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setPage(1)}
              disabled={!meta.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
              <ChevronLeft className="-ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrevPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {paginationNumbers.map((num, i) =>
              num === 'ellipsis' ? (
                <span key={`ellipsis-${i}`} className="text-muted-foreground px-2">
                  ...
                </span>
              ) : (
                <Button
                  key={num}
                  variant={page === num ? 'default' : 'outline'}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setPage(num)}
                >
                  {num}
                </Button>
              )
            )}

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setPage((p) => p + 1)}
              disabled={!meta.hasNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setPage(meta.totalPages)}
              disabled={!meta.hasNextPage}
            >
              <ChevronRight className="h-4 w-4" />
              <ChevronRight className="-ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={contactToDelete ? 'Delete Contact' : `Delete ${selectedIds.length} Contacts`}
        description={
          contactToDelete
            ? 'Are you sure you want to delete this contact? This action cannot be undone.'
            : `Are you sure you want to delete ${selectedIds.length} contacts? This action cannot be undone.`
        }
        confirmText="Delete"
        onConfirm={handleDelete}
        loading={deleteMutation.isPending || bulkDeleteMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
