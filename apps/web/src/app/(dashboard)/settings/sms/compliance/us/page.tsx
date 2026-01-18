'use client';

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/common/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useUS10DLCStatus,
  useUS10DLCGuide,
  useRefreshUS10DLCStatus,
} from '@/lib/hooks/use-sms-compliance';
import type { US10DLCBrandStatus, US10DLCCampaignStatus } from '@/lib/api/sms-compliance';

function getBrandStatusIcon(status: US10DLCBrandStatus) {
  switch (status) {
    case 'approved':
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
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

function getBrandStatusBadge(status: US10DLCBrandStatus) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-500">Approved</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'in_review':
      return <Badge variant="secondary">In Review</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    case 'suspended':
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">Not Registered</Badge>;
  }
}

function getCampaignStatusBadge(status: US10DLCCampaignStatus) {
  switch (status) {
    case 'verified':
      return <Badge className="bg-green-500">Verified</Badge>;
    case 'pending':
      return <Badge variant="secondary">Pending</Badge>;
    case 'in_review':
      return <Badge variant="secondary">In Review</Badge>;
    case 'rejected':
      return <Badge variant="destructive">Rejected</Badge>;
    case 'suspended':
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">Not Registered</Badge>;
  }
}

function StepCard({
  step,
  title,
  description,
  status,
  isActive,
}: {
  step: number;
  title: string;
  description: string;
  status: 'completed' | 'pending';
  isActive: boolean;
}) {
  const isCompleted = status === 'completed';

  return (
    <div
      className={`relative flex gap-4 rounded-lg border p-4 transition-colors ${
        isActive
          ? 'border-primary bg-primary/5'
          : isCompleted
            ? 'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20'
            : ''
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
          isCompleted
            ? 'bg-green-500 text-white'
            : isActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step}
      </div>
      <div className="space-y-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

export default function US10DLCPage() {
  const { data: status, isLoading: isLoadingStatus } = useUS10DLCStatus();
  const { data: guide, isLoading: isLoadingGuide } = useUS10DLCGuide();
  const refreshMutation = useRefreshUS10DLCStatus();

  const isLoading = isLoadingStatus || isLoadingGuide;

  const getCurrentStep = () => {
    if (!status) return 1;
    if (status.brandStatus === 'not_registered') return 1;
    if (status.brandStatus !== 'approved') return 1;
    if (status.campaignStatus === 'not_registered') return 2;
    if (status.campaignStatus !== 'verified') return 2;
    return 3;
  };

  const currentStep = getCurrentStep();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="US 10DLC Compliance"
        description="Register your brand and campaign for A2P messaging to US phone numbers"
      >
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/settings/sms/compliance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`}
            />
            Refresh Status
          </Button>
        </div>
      </PageHeader>

      {/* Status Card */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ) : status ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="text-primary h-5 w-5" />
                <CardTitle>Registration Status</CardTitle>
              </div>
              {status.isCompliant ? (
                <Badge className="bg-green-500">Compliant</Badge>
              ) : (
                <Badge variant="secondary">Not Compliant</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {getBrandStatusIcon(status.brandStatus)}
                  <div>
                    <p className="font-medium">Brand Registration</p>
                    {status.brandName && (
                      <p className="text-muted-foreground text-sm">{status.brandName}</p>
                    )}
                  </div>
                </div>
                {getBrandStatusBadge(status.brandStatus)}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  {getBrandStatusIcon(
                    status.campaignStatus === 'verified'
                      ? 'approved'
                      : (status.campaignStatus as US10DLCBrandStatus)
                  )}
                  <div>
                    <p className="font-medium">Campaign Registration</p>
                    <p className="text-muted-foreground text-sm">TCR Campaign</p>
                  </div>
                </div>
                {getCampaignStatusBadge(status.campaignStatus)}
              </div>
            </div>

            {status.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Registration Issues</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {status.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Setup Guide</CardTitle>
          <CardDescription>Complete these steps to register for US 10DLC messaging</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : guide ? (
            <>
              <div className="space-y-3">
                {guide.steps.map((step, index) => (
                  <StepCard
                    key={step.step}
                    step={step.step}
                    title={step.title}
                    description={step.description}
                    status={step.status}
                    isActive={currentStep === step.step}
                  />
                ))}
              </div>

              <Separator className="my-6" />

              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">Estimated Processing Time</h4>
                    <p className="text-muted-foreground text-sm">{guide.estimatedTime}</p>
                  </div>
                  <Clock className="text-muted-foreground h-5 w-5" />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="flex-1">
                  <a href={guide.trustHubUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Open Twilio Trust Hub
                  </a>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <a href={guide.documentation} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Documentation
                  </a>
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What is 10DLC?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              10DLC (10-Digit Long Code) is a system for businesses to send Application-to-Person
              (A2P) messaging using standard 10-digit phone numbers in the United States.
            </p>
            <p>
              All businesses sending SMS to US numbers must register their brand and campaigns with
              The Campaign Registry (TCR) through Twilio Trust Hub.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Valid business information (EIN, address, website)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Clear use case description (marketing, notifications, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Sample messages demonstrating your messaging</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <span>Opt-in and opt-out procedures</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Important Notice */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          Brand and campaign registration is done through Twilio Trust Hub. Once registered, click
          &quot;Refresh Status&quot; to sync your compliance status with our platform. Registration
          typically takes 1-5 business days for approval.
        </AlertDescription>
      </Alert>
    </div>
  );
}
