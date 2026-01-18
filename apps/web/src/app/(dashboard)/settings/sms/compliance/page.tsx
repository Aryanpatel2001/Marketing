'use client';

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Settings2,
  Shield,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  useComplianceStatus,
  useUpdateComplianceMode,
  useUS10DLCStatus,
} from '@/lib/hooks/use-sms-compliance';
import type { ComplianceMode, ComplianceStatus } from '@/lib/api/sms-compliance';
import { useAuthStore } from '@/store/auth-store';

function getStatusIcon(status: ComplianceStatus, isCompliant: boolean) {
  if (isCompliant) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  }
  switch (status) {
    case 'pending':
    case 'in_review':
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case 'rejected':
    case 'suspended':
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <AlertCircle className="text-muted-foreground h-5 w-5" />;
  }
}

function getStatusBadge(status: ComplianceStatus, isCompliant: boolean) {
  if (isCompliant) {
    return (
      <Badge variant="default" className="bg-green-500">
        Compliant
      </Badge>
    );
  }
  switch (status) {
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'in_review':
      return <Badge variant="secondary">In Review</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    case 'suspended':
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">Not Started</Badge>;
  }
}

function getModeBadge(mode: ComplianceMode) {
  switch (mode) {
    case 'strict':
      return <Badge variant="destructive">Strict Mode</Badge>;
    case 'warn':
      return <Badge variant="secondary">Warning Mode</Badge>;
    case 'off':
      return <Badge variant="outline">Disabled</Badge>;
  }
}

interface RegionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  flag: string;
  status: ComplianceStatus;
  isCompliant: boolean;
  details: string;
  href: string;
  extraInfo?: React.ReactNode;
}

function RegionCard({
  title,
  description,
  icon,
  flag,
  status,
  isCompliant,
  details,
  href,
  extraInfo,
}: RegionCardProps) {
  return (
    <Card className="group relative overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{flag}</span>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          {getStatusIcon(status, isCompliant)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Status</span>
          {getStatusBadge(status, isCompliant)}
        </div>
        <p className="text-muted-foreground text-sm">{details}</p>
        {extraInfo}
        <Separator />
        <Link href={href}>
          <Button variant="ghost" className="w-full justify-between">
            Configure
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function SmsCompliancePage() {
  const { user } = useAuthStore();
  const tenantRegion = user?.tenantRegion || 'US';

  const { data: complianceStatus, isLoading: isLoadingStatus } = useComplianceStatus();
  const { data: usStatus, isLoading: isLoadingUS } = useUS10DLCStatus();
  const updateModeMutation = useUpdateComplianceMode();

  const [selectedMode, setSelectedMode] = useState<ComplianceMode | undefined>(
    complianceStatus?.mode
  );

  const handleModeChange = (mode: ComplianceMode) => {
    setSelectedMode(mode);
    updateModeMutation.mutate(mode);
  };

  const isLoading = isLoadingStatus || (tenantRegion === 'US' && isLoadingUS);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SMS Compliance"
        description={`Manage ${tenantRegion === 'US' ? 'US 10DLC' : 'EU GDPR'} SMS compliance requirements`}
      >
        <Button variant="outline" asChild>
          <a
            href={
              tenantRegion === 'US'
                ? 'https://www.twilio.com/docs/sms/a2p-10dlc'
                : 'https://www.twilio.com/docs/sms/regulatory/eu-regulations'
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Documentation
          </a>
        </Button>
      </PageHeader>

      {/* Compliance Mode Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="text-primary h-5 w-5" />
              <div>
                <CardTitle className="text-lg">Compliance Enforcement</CardTitle>
                <CardDescription>
                  Control how the system handles non-compliant messages
                </CardDescription>
              </div>
            </div>
            {complianceStatus && getModeBadge(complianceStatus.mode)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Settings2 className="h-4 w-4" />
                <span className="font-medium">Enforcement Mode</span>
              </div>
              <p className="text-muted-foreground max-w-md text-sm">
                {complianceStatus?.mode === 'strict' &&
                  'Non-compliant messages will be blocked from sending.'}
                {complianceStatus?.mode === 'warn' &&
                  'Non-compliant messages will show warnings but still send.'}
                {complianceStatus?.mode === 'off' && 'No compliance checks will be performed.'}
              </p>
            </div>
            <Select
              value={selectedMode || complianceStatus?.mode}
              onValueChange={(value) => handleModeChange(value as ComplianceMode)}
              disabled={updateModeMutation.isPending}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    Strict - Block
                  </div>
                </SelectItem>
                <SelectItem value="warn">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    Warn - Allow
                  </div>
                </SelectItem>
                <SelectItem value="off">
                  <div className="flex items-center gap-2">
                    <Globe className="text-muted-foreground h-4 w-4" />
                    Disabled
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Region Card - Show only relevant region */}
      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-1">
          <Card>
            <CardHeader>
              <Skeleton className="h-12 w-full" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-1">
          {tenantRegion === 'US' ? (
            /* US 10DLC */
            <RegionCard
              title="United States"
              description="10DLC / A2P Registration"
              icon={<Shield className="h-5 w-5" />}
              flag="🇺🇸"
              status={complianceStatus?.us.status || 'not_started'}
              isCompliant={complianceStatus?.us.isCompliant || false}
              details={complianceStatus?.us.details || 'Register your brand and campaign with TCR'}
              href="/settings/sms/compliance/us"
              extraInfo={
                usStatus && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Brand</span>
                      <span className="font-medium capitalize">
                        {usStatus.brandStatus.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-muted-foreground">Campaign</span>
                      <span className="font-medium capitalize">
                        {usStatus.campaignStatus.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                )
              }
            />
          ) : (
            /* EU GDPR */
            <RegionCard
              title="Europe"
              description="GDPR / Sender ID Registration"
              icon={<Globe className="h-5 w-5" />}
              flag="🇪🇺"
              status={complianceStatus?.eu.status || 'not_started'}
              isCompliant={complianceStatus?.eu.isCompliant || false}
              details={
                complianceStatus?.eu.details ||
                'Register sender IDs and manage consent for EU countries'
              }
              href="/settings/sms/compliance/eu"
            />
          )}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common compliance tasks and resources</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tenantRegion === 'US' ? (
              <>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href="/settings/sms/compliance/us">
                    <Shield className="mr-2 h-4 w-4" />
                    Setup US 10DLC
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a
                    href="https://console.twilio.com/us1/develop/sms/regulatory-compliance/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Twilio Trust Hub
                  </a>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a
                    href="https://www.twilio.com/docs/sms/a2p-10dlc"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    10DLC Documentation
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="justify-start" asChild>
                  <Link href="/settings/sms/compliance/eu">
                    <Globe className="mr-2 h-4 w-4" />
                    Register EU Sender ID
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a
                    href="https://www.twilio.com/docs/sms/regulatory/eu-regulations"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    EU Regulations
                  </a>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <a
                    href="https://console.twilio.com/us1/develop/sms/senders/alpha-sender-ids"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Twilio Sender IDs
                  </a>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card - Show only relevant region */}
      <div className="grid gap-6 md:grid-cols-1">
        {tenantRegion === 'US' ? (
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900">
                  <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-medium">US 10DLC Requirements</h4>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Required for sending A2P SMS to US numbers. You must register your brand and
                    campaign through Twilio Trust Hub. Registration typically takes 1-5 business
                    days. Without proper 10DLC registration, your messages may be blocked or heavily
                    filtered.
                  </p>
                  <ul className="text-muted-foreground mt-2 list-inside list-disc text-sm">
                    <li>Register your business identity (Brand)</li>
                    <li>Create a messaging campaign use case</li>
                    <li>Link your phone numbers to the campaign</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900">
                  <Globe className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium">EU GDPR Requirements</h4>
                  <p className="text-muted-foreground mt-1 text-sm">
                    For sending SMS to EU countries, you must comply with GDPR regulations and local
                    telecom requirements. Some countries require pre-registered Sender IDs.
                  </p>
                  <ul className="text-muted-foreground mt-2 list-inside list-disc text-sm">
                    <li>Include opt-out text in all marketing messages</li>
                    <li>Register Sender IDs for countries that require them</li>
                    <li>Maintain proper consent records for all recipients</li>
                    <li>Honor opt-out requests within 24 hours</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
