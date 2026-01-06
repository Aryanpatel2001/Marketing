'use client';

import Link from 'next/link';
import { PageHeader, StatsCard } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Send,
  Mail,
  MousePointerClick,
  TrendingUp,
  Plus,
  ArrowRight,
  BarChart3,
} from 'lucide-react';

// Mock data - will be replaced with real API calls
const stats = [
  {
    title: 'Total Contacts',
    value: '12,847',
    icon: Users,
    trend: { value: 12.5, isPositive: true },
    description: 'from last month',
  },
  {
    title: 'Campaigns Sent',
    value: '156',
    icon: Send,
    trend: { value: 8.2, isPositive: true },
    description: 'from last month',
  },
  {
    title: 'Open Rate',
    value: '24.5%',
    icon: Mail,
    trend: { value: 2.1, isPositive: true },
    description: 'vs. industry avg',
  },
  {
    title: 'Click Rate',
    value: '3.8%',
    icon: MousePointerClick,
    trend: { value: 0.5, isPositive: false },
    description: 'from last month',
  },
];

const recentCampaigns = [
  {
    id: '1',
    name: 'January Newsletter',
    type: 'email',
    status: 'sent',
    sentAt: '2026-01-05',
    stats: { sent: 5432, opened: 1245, clicked: 234 },
  },
  {
    id: '2',
    name: 'Holiday Sale Reminder',
    type: 'sms',
    status: 'sent',
    sentAt: '2026-01-03',
    stats: { sent: 2100, opened: 1890, clicked: 456 },
  },
  {
    id: '3',
    name: 'Product Launch',
    type: 'email',
    status: 'scheduled',
    sentAt: '2026-01-08',
    stats: { sent: 0, opened: 0, clicked: 0 },
  },
  {
    id: '4',
    name: 'Welcome Series',
    type: 'whatsapp',
    status: 'draft',
    sentAt: null,
    stats: { sent: 0, opened: 0, clicked: 0 },
  },
];

const quickActions = [
  {
    title: 'Create Campaign',
    description: 'Start a new email, SMS, or WhatsApp campaign',
    href: '/dashboard/campaigns/new',
    icon: Send,
  },
  {
    title: 'Import Contacts',
    description: 'Upload contacts from CSV or Excel',
    href: '/dashboard/contacts/import',
    icon: Users,
  },
  {
    title: 'View Analytics',
    description: 'See detailed performance reports',
    href: '/dashboard/analytics',
    icon: BarChart3,
  },
];

function getCampaignStatusBadge(status: string) {
  const variants: Record<string, 'default' | 'secondary' | 'success' | 'warning'> = {
    sent: 'success',
    scheduled: 'warning',
    draft: 'secondary',
    sending: 'default',
  };
  return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
}

function getCampaignTypeBadge(type: string) {
  const labels: Record<string, string> = {
    email: 'Email',
    sms: 'SMS',
    whatsapp: 'WhatsApp',
  };
  return (
    <Badge variant="outline" className="text-xs">
      {labels[type] || type}
    </Badge>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Dashboard"
        description="Welcome back! Here's an overview of your marketing performance."
      >
        <Link href="/dashboard/campaigns/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </Link>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <StatsCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Campaigns */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Campaigns</CardTitle>
              <CardDescription>Your latest marketing campaigns</CardDescription>
            </div>
            <Link href="/dashboard/campaigns">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/dashboard/campaigns/${campaign.id}`}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{campaign.name}</span>
                      {getCampaignTypeBadge(campaign.type)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {campaign.sentAt && <span>{campaign.sentAt}</span>}
                      {campaign.stats.sent > 0 && (
                        <>
                          <span>{campaign.stats.sent.toLocaleString()} sent</span>
                          <span>{campaign.stats.opened.toLocaleString()} opened</span>
                        </>
                      )}
                    </div>
                  </div>
                  {getCampaignStatusBadge(campaign.status)}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickActions.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="rounded-lg bg-primary/10 p-2">
                  <action.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium leading-none">{action.title}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Performance Chart Placeholder */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Performance Overview</CardTitle>
            <CardDescription>Campaign performance over the last 30 days</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              +12.5%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center border rounded-lg bg-muted/30">
            <div className="text-center space-y-2">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                Performance chart will be rendered here
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
