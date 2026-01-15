'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  Link2,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  MousePointerClick,
  Pause,
  Phone,
  Play,
  RefreshCw,
  Send,
  StopCircle,
  TestTube2,
  Truck,
  UserMinus,
  Users,
  XCircle,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

import { ActivityChart } from '@/components/campaigns/ActivityChart';
import {
  Campaign,
  campaignsApi,
  CampaignStatus,
  CampaignType,
  MessageStatus,
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

// Message status configuration
const messageStatusConfig: Record<
  MessageStatus,
  { color: string; label: string; icon: typeof Send }
> = {
  queued: { color: 'text-gray-600', label: 'Queued', icon: Clock },
  sending: { color: 'text-blue-600', label: 'Sending', icon: RefreshCw },
  sent: { color: 'text-blue-600', label: 'Sent', icon: Send },
  delivered: { color: 'text-green-600', label: 'Delivered', icon: CheckCircle2 },
  opened: { color: 'text-purple-600', label: 'Opened', icon: MailOpen },
  clicked: { color: 'text-amber-600', label: 'Clicked', icon: MousePointerClick },
  bounced: { color: 'text-red-600', label: 'Bounced', icon: AlertTriangle },
  failed: { color: 'text-red-600', label: 'Failed', icon: XCircle },
  unsubscribed: { color: 'text-gray-600', label: 'Unsubscribed', icon: UserMinus },
  complained: { color: 'text-red-600', label: 'Complained', icon: AlertOctagon },
  read: { color: 'text-purple-600', label: 'Read', icon: Eye },
};

// Event type configuration
const eventTypeConfig: Record<string, { color: string; label: string; icon: typeof Send }> = {
  sent: { color: 'text-blue-600', label: 'Sent', icon: Send },
  delivered: { color: 'text-green-600', label: 'Delivered', icon: Truck },
  opened: { color: 'text-purple-600', label: 'Opened', icon: MailOpen },
  clicked: { color: 'text-amber-600', label: 'Clicked', icon: Link2 },
  bounced: { color: 'text-red-600', label: 'Bounced', icon: AlertTriangle },
  failed: { color: 'text-red-600', label: 'Failed', icon: XCircle },
  unsubscribed: { color: 'text-gray-600', label: 'Unsubscribed', icon: UserMinus },
  complained: { color: 'text-red-600', label: 'Complained', icon: AlertOctagon },
};

// Campaign Status Badge Component
function CampaignStatusBadge({
  status,
  size = 'default',
}: {
  status: CampaignStatus;
  size?: 'default' | 'lg';
}) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn('gap-1', config.bgColor, config.color, size === 'lg' && 'px-3 py-1 text-sm')}
    >
      {Icon && <Icon className={cn('h-3 w-3', size === 'lg' && 'h-4 w-4')} />}
      {config.label}
    </Badge>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: typeof Send;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {subValue && <p className="text-muted-foreground mt-1 text-xs">{subValue}</p>}
          </div>
          <div className={cn('rounded-lg p-3', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const campaignId = params.id as string;

  // State for dialogs
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [messagesPage, setMessagesPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);

  // Fetch campaign
  const {
    data: campaign,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => campaignsApi.getCampaign(campaignId),
    enabled: !!campaignId,
    refetchInterval: (query) => {
      // Auto-refresh when campaign is sending
      const data = query.state.data;
      return data?.status === 'sending' ? 5000 : false;
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['campaign-stats', campaignId],
    queryFn: () => campaignsApi.getStats(campaignId),
    enabled: !!campaignId && campaign?.status !== 'draft',
    refetchInterval: campaign?.status === 'sending' ? 5000 : 30000,
  });

  // Fetch messages (recipients)
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['campaign-messages', campaignId, messagesPage],
    queryFn: () => campaignsApi.getMessages(campaignId, { page: messagesPage, limit: 10 }),
    enabled: !!campaignId && campaign?.status !== 'draft',
  });

  // Fetch events (activity)
  const { data: eventsData, isLoading: eventsLoading } = useQuery({
    queryKey: ['campaign-events', campaignId, eventsPage],
    queryFn: () => campaignsApi.getEvents(campaignId, { page: eventsPage, limit: 20 }),
    enabled: !!campaignId && campaign?.status !== 'draft',
  });

  // Fetch activity stats for chart
  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['campaign-activity-stats', campaignId],
    queryFn: () => campaignsApi.getActivityStats(campaignId),
    enabled: !!campaignId && campaign?.status !== 'draft',
    refetchInterval: campaign?.status === 'sending' ? 30000 : false,
  });

  // Send campaign mutation
  const sendMutation = useMutation({
    mutationFn: () => campaignsApi.sendCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowSendDialog(false);
      toast.success('Campaign sending started', {
        description: 'Your campaign is now being sent to recipients.',
      });
    },
    onError: (error: any) => {
      toast.error('Failed to send campaign', {
        description: error.response?.data?.message || error.message,
      });
    },
  });

  // Pause campaign mutation
  const pauseMutation = useMutation({
    mutationFn: () => campaignsApi.pauseCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowPauseDialog(false);
      toast.success('Campaign paused');
    },
    onError: (error: any) => {
      toast.error('Failed to pause campaign', {
        description: error.response?.data?.message || error.message,
      });
    },
  });

  // Resume campaign mutation
  const resumeMutation = useMutation({
    mutationFn: () => campaignsApi.resumeCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign resumed');
    },
    onError: (error: any) => {
      toast.error('Failed to resume campaign', {
        description: error.response?.data?.message || error.message,
      });
    },
  });

  // Cancel campaign mutation
  const cancelMutation = useMutation({
    mutationFn: () => campaignsApi.cancelCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setShowCancelDialog(false);
      toast.success('Campaign cancelled');
    },
    onError: (error: any) => {
      toast.error('Failed to cancel campaign', {
        description: error.response?.data?.message || error.message,
      });
    },
  });

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: (email: string) => campaignsApi.sendTestEmail(campaignId, email),
    onSuccess: (result) => {
      if (result.success) {
        setShowTestDialog(false);
        setTestEmail('');
        toast.success('Test email sent', {
          description: `A test email has been sent to ${testEmail}`,
        });
      } else {
        toast.error('Failed to send test email', {
          description: result.error || 'Unknown error occurred',
        });
      }
    },
    onError: (error: any) => {
      toast.error('Failed to send test email', {
        description: error.response?.data?.message || error.message,
      });
    },
  });

  // Format date helper
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Calculate progress
  const getProgress = (c: Campaign) => {
    if (c.totalRecipients === 0) return 0;
    return Math.round(((c.sentCount + c.failedCount) / c.totalRecipients) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <AlertTriangle className="text-destructive mb-4 h-12 w-12" />
        <h2 className="text-lg font-semibold">Campaign not found</h2>
        <p className="text-muted-foreground mb-4">
          The campaign you're looking for doesn't exist or has been deleted.
        </p>
        <Button onClick={() => router.push('/campaigns')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Campaigns
        </Button>
      </div>
    );
  }

  const TypeIcon = typeConfig[campaign.type].icon;
  const messages = messagesData?.data || [];
  const events = eventsData?.data || [];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/campaigns')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} size="lg" />
            </div>
            <div className="mt-1 flex items-center gap-4">
              <div
                className={cn('flex items-center gap-1.5 text-sm', typeConfig[campaign.type].color)}
              >
                <TypeIcon className="h-4 w-4" />
                {typeConfig[campaign.type].label}
              </div>
              {campaign.description && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <p className="text-muted-foreground text-sm">{campaign.description}</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Test Email Button - Only for draft email campaigns */}
          {campaign.status === 'draft' && campaign.type === 'email' && (
            <Button variant="outline" onClick={() => setShowTestDialog(true)}>
              <TestTube2 className="mr-2 h-4 w-4" />
              Send Test
            </Button>
          )}

          {/* Draft Actions */}
          {campaign.status === 'draft' && (
            <>
              <Button
                variant="outline"
                onClick={() => router.push(`/campaigns/${campaign.id}/edit`)}
              >
                Edit Campaign
              </Button>
              <Button onClick={() => setShowSendDialog(true)}>
                <Play className="mr-2 h-4 w-4" />
                Send Now
              </Button>
            </>
          )}

          {/* Sending Actions */}
          {campaign.status === 'sending' && (
            <>
              <Button variant="outline" onClick={() => setShowPauseDialog(true)}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                <StopCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}

          {/* Paused Actions */}
          {campaign.status === 'paused' && (
            <>
              <Button onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                {resumeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Resume
              </Button>
              <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
                <StopCircle className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          )}

          {/* Scheduled Actions */}
          {campaign.status === 'scheduled' && (
            <Button variant="destructive" onClick={() => setShowCancelDialog(true)}>
              <Ban className="mr-2 h-4 w-4" />
              Cancel Schedule
            </Button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {/* Send Campaign Confirmation Dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Campaign Now?</DialogTitle>
            <DialogDescription>
              This will immediately start sending the campaign to your selected audience. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-muted space-y-2 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Campaign</span>
                <span className="font-medium">{campaign.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Type</span>
                <span className="font-medium capitalize">{campaign.type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Audience</span>
                <span className="font-medium capitalize">{campaign.audienceType}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
              {sendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Test Email Dialog */}
      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test version of your email to preview how it will look. The subject will be
              prefixed with [TEST].
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-email">Email Address</Label>
              <Input
                id="test-email"
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => sendTestMutation.mutate(testEmail)}
              disabled={sendTestMutation.isPending || !testEmail}
            >
              {sendTestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pause Campaign Dialog */}
      <Dialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause Campaign?</DialogTitle>
            <DialogDescription>
              This will pause the campaign. No more messages will be sent until you resume. Messages
              already in queue will complete.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPauseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              {pauseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Pause Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Campaign Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Campaign?</DialogTitle>
            <DialogDescription>
              This will permanently cancel the campaign. This action cannot be undone. Messages
              already sent will not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Campaign
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      {campaign.status !== 'draft' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Recipients"
            value={campaign.totalRecipients.toLocaleString()}
            icon={Users}
            color="bg-blue-100 text-blue-600"
          />
          <StatCard
            label="Sent"
            value={campaign.sentCount.toLocaleString()}
            subValue={
              campaign.totalRecipients > 0
                ? `${((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1)}%`
                : undefined
            }
            icon={Send}
            color="bg-green-100 text-green-600"
          />
          {campaign.type === 'email' && (
            <>
              <StatCard
                label="Opened"
                value={campaign.uniqueOpens.toLocaleString()}
                subValue={stats ? `${stats.openRate}% open rate` : undefined}
                icon={Eye}
                color="bg-purple-100 text-purple-600"
              />
              <StatCard
                label="Clicked"
                value={campaign.uniqueClicks.toLocaleString()}
                subValue={stats ? `${stats.clickRate}% click rate` : undefined}
                icon={MousePointerClick}
                color="bg-amber-100 text-amber-600"
              />
            </>
          )}
          {campaign.type === 'sms' && (
            <>
              <StatCard
                label="Delivered"
                value={campaign.deliveredCount.toLocaleString()}
                subValue={stats ? `${stats.deliveryRate}% delivery rate` : undefined}
                icon={Send}
                color="bg-purple-100 text-purple-600"
              />
              <StatCard
                label="Failed"
                value={campaign.failedCount.toLocaleString()}
                icon={AlertTriangle}
                color="bg-red-100 text-red-600"
              />
            </>
          )}
          {campaign.type === 'whatsapp' && (
            <>
              <StatCard
                label="Read"
                value={campaign.readCount.toLocaleString()}
                icon={Eye}
                color="bg-purple-100 text-purple-600"
              />
              <StatCard
                label="Replied"
                value={campaign.repliedCount.toLocaleString()}
                icon={MessageSquare}
                color="bg-amber-100 text-amber-600"
              />
            </>
          )}
        </div>
      )}

      {/* Progress bar for sending campaigns */}
      {campaign.status === 'sending' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sending Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {campaign.sentCount.toLocaleString()} of{' '}
                  {campaign.totalRecipients.toLocaleString()} sent
                </span>
                <span className="font-medium">{getProgress(campaign)}%</span>
              </div>
              <Progress value={getProgress(campaign)} className="h-2" />
              {campaign.failedCount > 0 && (
                <p className="text-xs text-red-600">
                  {campaign.failedCount.toLocaleString()} failed
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          {campaign.status !== 'draft' && (
            <>
              <TabsTrigger value="recipients">Recipients</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Campaign Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Type</span>
                  <div
                    className={cn(
                      'flex items-center gap-1.5 text-sm font-medium',
                      typeConfig[campaign.type].color
                    )}
                  >
                    <TypeIcon className="h-4 w-4" />
                    {typeConfig[campaign.type].label}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Created</span>
                  <span className="text-sm">{formatDate(campaign.createdAt)}</span>
                </div>
                {campaign.scheduledAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Scheduled</span>
                    <span className="text-sm">{formatDate(campaign.scheduledAt)}</span>
                  </div>
                )}
                {campaign.startedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Started</span>
                    <span className="text-sm">{formatDate(campaign.startedAt)}</span>
                  </div>
                )}
                {campaign.completedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Completed</span>
                    <span className="text-sm">{formatDate(campaign.completedAt)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Audience */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audience</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Audience Type</span>
                  <Badge variant="outline" className="capitalize">
                    {campaign.audienceType}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Total Recipients</span>
                  <span className="text-sm font-medium">
                    {campaign.totalRecipients.toLocaleString()}
                  </span>
                </div>
                {campaign.contactListIds.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Contact Lists</span>
                    <span className="text-sm">{campaign.contactListIds.length} list(s)</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Delivery Stats for completed campaigns */}
          {stats && campaign.status === 'sent' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-5">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Delivery Rate</p>
                    <p className="text-2xl font-bold text-green-600">{stats.deliveryRate}%</p>
                  </div>
                  {campaign.type === 'email' && (
                    <>
                      <div className="text-center">
                        <p className="text-muted-foreground text-sm">Open Rate</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.openRate}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-sm">Click Rate</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.clickRate}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-sm">Bounce Rate</p>
                        <p className="text-2xl font-bold text-red-600">{stats.bounceRate}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-muted-foreground text-sm">Unsubscribe Rate</p>
                        <p className="text-2xl font-bold text-gray-600">{stats.unsubscribeRate}%</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Content</CardTitle>
              <CardDescription>Preview of the content being sent to recipients</CardDescription>
            </CardHeader>
            <CardContent>
              {campaign.type === 'email' && 'subject' in campaign.content && (
                <div className="space-y-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">Subject</p>
                    <p className="font-medium">{campaign.content.subject}</p>
                  </div>
                  {campaign.content.previewText && (
                    <div>
                      <p className="text-muted-foreground mb-1 text-sm">Preview Text</p>
                      <p>{campaign.content.previewText}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">From</p>
                    <p>
                      {campaign.content.fromName} &lt;{campaign.content.fromEmail}&gt;
                    </p>
                  </div>
                  {campaign.content.replyTo && (
                    <div>
                      <p className="text-muted-foreground mb-1 text-sm">Reply-To</p>
                      <p>{campaign.content.replyTo}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground mb-2 text-sm">Email Preview</p>
                    <div className="overflow-hidden rounded-lg border">
                      <div className="bg-muted border-b px-4 py-2 text-sm font-medium">
                        {campaign.content.subject}
                      </div>
                      <div
                        className="max-h-[500px] min-h-[300px] overflow-auto bg-white p-4"
                        dangerouslySetInnerHTML={{ __html: campaign.content.htmlContent }}
                      />
                    </div>
                  </div>
                </div>
              )}
              {campaign.type === 'sms' && 'message' in campaign.content && (
                <div className="space-y-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">Message</p>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="whitespace-pre-wrap">{campaign.content.message}</p>
                    </div>
                  </div>
                  {campaign.content.senderId && (
                    <div>
                      <p className="text-muted-foreground mb-1 text-sm">Sender ID</p>
                      <p>{campaign.content.senderId}</p>
                    </div>
                  )}
                </div>
              )}
              {campaign.type === 'whatsapp' && 'templateName' in campaign.content && (
                <div className="space-y-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">Template</p>
                    <p className="font-medium">{campaign.content.templateName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">Category</p>
                    <Badge variant="outline">{campaign.content.category}</Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1 text-sm">Body</p>
                    <div className="bg-muted rounded-lg p-4">
                      <p className="whitespace-pre-wrap">{campaign.content.body}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recipients Tab */}
        <TabsContent value="recipients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recipients</CardTitle>
              <CardDescription>List of all recipients and their message status</CardDescription>
            </CardHeader>
            <CardContent>
              {messagesLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No recipients yet. Start the campaign to see recipients here.
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent At</TableHead>
                        <TableHead>Events</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messages.map((message) => {
                        const statusConf = messageStatusConfig[message.status];
                        const StatusIcon = statusConf?.icon || Clock;
                        return (
                          <TableRow key={message.id}>
                            <TableCell>
                              <div>
                                <p className="font-medium">{message.recipientName || 'Unknown'}</p>
                                <p className="text-muted-foreground text-sm">
                                  {message.recipientEmail || message.recipientPhone}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className={cn('flex items-center gap-1.5', statusConf?.color)}>
                                <StatusIcon className="h-4 w-4" />
                                <span className="text-sm">
                                  {statusConf?.label || message.status}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {message.sentAt ? formatRelativeTime(message.sentAt) : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {message.openedAt && (
                                  <span title="Opened">
                                    <MailOpen className="h-4 w-4 text-purple-600" />
                                  </span>
                                )}
                                {message.clickedAt && (
                                  <span title="Clicked">
                                    <MousePointerClick className="h-4 w-4 text-amber-600" />
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {messagesData && messagesData.meta.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-muted-foreground text-sm">
                        Page {messagesPage} of {messagesData.meta.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setMessagesPage((p) => Math.max(1, p - 1))}
                          disabled={messagesPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setMessagesPage((p) => Math.min(messagesData.meta.totalPages, p + 1))
                          }
                          disabled={messagesPage === messagesData.meta.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          {/* Activity Chart */}
          <ActivityChart data={activityData?.timeline || []} isLoading={activityLoading} />

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Timeline</CardTitle>
              <CardDescription>Real-time events from your campaign</CardDescription>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : events.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">
                  No activity yet. Events will appear here as recipients interact with your
                  campaign.
                </p>
              ) : (
                <>
                  <div className="space-y-4">
                    {events.map((event) => {
                      const eventConf = eventTypeConfig[event.eventType] || {
                        color: 'text-gray-600',
                        label: event.eventType,
                        icon: Clock,
                      };
                      const EventIcon = eventConf.icon;
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-4 border-b pb-4 last:border-0"
                        >
                          <div className={cn('bg-muted rounded-full p-2', eventConf.color)}>
                            <EventIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={cn('font-medium', eventConf.color)}>
                                {eventConf.label}
                              </span>
                              <span className="text-muted-foreground text-sm">
                                {formatRelativeTime(event.createdAt)}
                              </span>
                            </div>
                            {event.linkUrl && (
                              <p className="text-muted-foreground mt-1 truncate text-sm">
                                Link: {event.linkUrl}
                              </p>
                            )}
                            {event.deviceType && (
                              <p className="text-muted-foreground mt-1 text-sm">
                                {event.deviceType} · {event.browser} · {event.os}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {eventsData && eventsData.meta.totalPages > 1 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-muted-foreground text-sm">
                        Page {eventsPage} of {eventsData.meta.totalPages}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                          disabled={eventsPage === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEventsPage((p) => Math.min(eventsData.meta.totalPages, p + 1))
                          }
                          disabled={eventsPage === eventsData.meta.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
