'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit,
  Eye,
  Loader2,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmationDialog } from '@/components/common/confirmation-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import {
  Campaign,
  campaignsApi,
  CampaignsQuery,
  CampaignStatus,
  CampaignType,
} from '@/lib/api/campaigns';

// Type icons and colors
const typeConfig: Record<CampaignType, { icon: typeof Mail; color: string; label: string }> = {
  email: { icon: Mail, color: 'bg-blue-100 text-blue-700', label: 'Email' },
  sms: { icon: Phone, color: 'bg-green-100 text-green-700', label: 'SMS' },
  whatsapp: { icon: MessageSquare, color: 'bg-emerald-100 text-emerald-700', label: 'WhatsApp' },
};

// Status badges configuration
const statusConfig: Record<
  CampaignStatus,
  { color: string; bgColor: string; label: string; icon?: typeof Send }
> = {
  draft: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Draft' },
  scheduled: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Scheduled', icon: Calendar },
  sending: { color: 'text-amber-700', bgColor: 'bg-amber-100', label: 'Sending', icon: Send },
  paused: { color: 'text-orange-700', bgColor: 'bg-orange-100', label: 'Paused', icon: Pause },
  sent: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Sent' },
  cancelled: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Cancelled', icon: XCircle },
  failed: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Failed' },
};

// Campaign Status Badge Component
function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={cn('gap-1', config.bgColor, config.color)}>
      {Icon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}

// Campaign Type Badge Component
function CampaignTypeBadge({ type }: { type: CampaignType }) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
        config.color
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </div>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<CampaignType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<CampaignStatus | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);

  // Build query
  const query: CampaignsQuery = useMemo(
    () => ({
      page: currentPage,
      limit: 10,
      search: searchQuery || undefined,
      type: selectedType !== 'all' ? selectedType : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    }),
    [currentPage, searchQuery, selectedType, selectedStatus]
  );

  // Fetch campaigns
  const {
    data: campaignsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['campaigns', query],
    queryFn: () => campaignsApi.getCampaigns(query),
  });

  // Fetch overview stats
  const { data: overview } = useQuery({
    queryKey: ['campaigns-overview'],
    queryFn: () => campaignsApi.getOverview(),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.deleteCampaign(id),
    onSuccess: () => {
      toast.success('Campaign deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns-overview'] });
      setDeleteDialogOpen(false);
      setCampaignToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete campaign');
    },
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.duplicateCampaign(id),
    onSuccess: (newCampaign) => {
      toast.success('Campaign duplicated successfully');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      router.push(`/campaigns/${newCampaign.id}`);
    },
    onError: () => {
      toast.error('Failed to duplicate campaign');
    },
  });

  // Pause mutation
  const pauseMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.pauseCampaign(id),
    onSuccess: () => {
      toast.success('Campaign paused');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => {
      toast.error('Failed to pause campaign');
    },
  });

  // Resume mutation
  const resumeMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.resumeCampaign(id),
    onSuccess: () => {
      toast.success('Campaign resumed');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => {
      toast.error('Failed to resume campaign');
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.cancelCampaign(id),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
    onError: () => {
      toast.error('Failed to cancel campaign');
    },
  });

  const campaigns = campaignsData?.data || [];
  const meta = campaignsData?.meta;

  const handleDelete = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  // Stats cards
  const statCards = [
    { label: 'Total', value: overview?.total || 0, color: 'text-gray-600' },
    { label: 'Sending', value: overview?.byStatus?.sending || 0, color: 'text-amber-600' },
    { label: 'Scheduled', value: overview?.byStatus?.scheduled || 0, color: 'text-blue-600' },
    { label: 'Draft', value: overview?.byStatus?.draft || 0, color: 'text-gray-500' },
  ];

  // Format date helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Calculate progress
  const getProgress = (campaign: Campaign) => {
    if (campaign.totalRecipients === 0) return 0;
    return Math.round(
      ((campaign.sentCount + campaign.failedCount) / campaign.totalRecipients) * 100
    );
  };

  // Calculate open rate
  const getOpenRate = (campaign: Campaign) => {
    if (campaign.deliveredCount === 0) return '-';
    const rate = (campaign.uniqueOpens / campaign.deliveredCount) * 100;
    return `${rate.toFixed(1)}%`;
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Create and manage your marketing campaigns</p>
        </div>
        <Button onClick={() => router.push('/campaigns/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">{stat.label}</span>
            </div>
            <p className={cn('mt-2 text-2xl font-bold', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={selectedType}
          onValueChange={(value) => {
            setSelectedType(value as CampaignType | 'all');
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value as CampaignStatus | 'all');
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="sending">Sending</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaigns Table */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-destructive">Failed to load campaigns</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['campaigns'] })}
          >
            Try Again
          </Button>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="bg-muted/20 flex flex-col items-center justify-center rounded-lg border py-12">
          <Send className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="text-lg font-medium">No campaigns yet</h3>
          <p className="text-muted-foreground mb-4">Create your first campaign to get started</p>
          <Button onClick={() => router.push('/campaigns/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{campaign.name}</span>
                      {campaign.description && (
                        <span className="text-muted-foreground max-w-[200px] truncate text-sm">
                          {campaign.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CampaignTypeBadge type={campaign.type} />
                  </TableCell>
                  <TableCell>
                    <CampaignStatusBadge status={campaign.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.status === 'sending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <span>{campaign.sentCount.toLocaleString()}</span>
                        <span className="text-muted-foreground text-xs">
                          ({getProgress(campaign)}%)
                        </span>
                      </div>
                    ) : campaign.sentCount > 0 ? (
                      campaign.sentCount.toLocaleString()
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {campaign.type === 'email' ? getOpenRate(campaign) : '-'}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground text-sm">
                      {campaign.scheduledAt
                        ? formatDate(campaign.scheduledAt)
                        : formatDate(campaign.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/campaigns/${campaign.id}`);
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        {campaign.status === 'draft' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/campaigns/${campaign.id}/edit`);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateMutation.mutate(campaign.id);
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {campaign.status === 'sending' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              pauseMutation.mutate(campaign.id);
                            }}
                          >
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </DropdownMenuItem>
                        )}
                        {campaign.status === 'paused' && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              resumeMutation.mutate(campaign.id);
                            }}
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Resume
                          </DropdownMenuItem>
                        )}
                        {['scheduled', 'sending', 'paused'].includes(campaign.status) && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelMutation.mutate(campaign.id);
                            }}
                            className="text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel
                          </DropdownMenuItem>
                        )}
                        {['draft', 'cancelled'].includes(campaign.status) && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(campaign);
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-muted-foreground text-sm">
            Showing {(meta.page - 1) * meta.limit + 1} to{' '}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total} campaigns
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={!meta.hasPrevPage}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-muted-foreground px-2 text-sm">
              Page {meta.page} of {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={!meta.hasNextPage}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Campaign"
        description={`Are you sure you want to delete "${campaignToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={confirmDelete}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
