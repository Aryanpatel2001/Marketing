'use client';

import { Hash, Phone, PhoneIncoming, Plus } from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { AddExistingNumberModal } from '@/components/sms/add-existing-number-modal';
import { PurchaseNumberModal } from '@/components/sms/purchase-number-modal';
import { RegisterSenderIdModal } from '@/components/sms/register-sender-id-modal';
import { SendersList } from '@/components/sms/senders-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlanLimits } from '@/lib/hooks/use-sms-senders';

export default function SmsSendersPage() {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showSenderIdModal, setShowSenderIdModal] = useState(false);
  const [showAddExistingModal, setShowAddExistingModal] = useState(false);

  const { data: planLimits, isLoading: isLoadingLimits } = usePlanLimits();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SMS Senders"
        description="Manage your phone numbers and sender IDs for SMS campaigns"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Sender
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowPurchaseModal(true)}>
              <Phone className="mr-2 h-4 w-4" />
              Purchase Phone Number
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowAddExistingModal(true)}>
              <PhoneIncoming className="mr-2 h-4 w-4" />
              Add Existing Number
              <Badge variant="outline" className="ml-2 text-xs">
                Trial
              </Badge>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowSenderIdModal(true)}
              disabled={!planLimits?.senderIdsAllowed}
            >
              <Hash className="mr-2 h-4 w-4" />
              Register Sender ID
              {!planLimits?.senderIdsAllowed && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  Enterprise
                </Badge>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {/* Plan Limits Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Plan Limits</CardTitle>
          <CardDescription>Your current SMS sender allocation</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLimits ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : planLimits ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Dedicated Numbers */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Dedicated Numbers</span>
                  <Phone className="text-muted-foreground h-4 w-4" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{planLimits.currentDedicatedNumbers}</span>
                  <span className="text-muted-foreground">
                    {' / '}
                    {planLimits.maxDedicatedNumbers === -1
                      ? 'Unlimited'
                      : planLimits.maxDedicatedNumbers}
                  </span>
                </div>
                {planLimits.canPurchaseDedicated ? (
                  <Badge variant="secondary" className="mt-2">
                    Available
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="mt-2">
                    Limit Reached
                  </Badge>
                )}
              </div>

              {/* Toll-Free Numbers */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Toll-Free Numbers</span>
                  <Phone className="text-muted-foreground h-4 w-4" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{planLimits.currentTollFreeNumbers}</span>
                  <span className="text-muted-foreground">
                    {' / '}
                    {planLimits.maxTollFreeNumbers === -1
                      ? 'Unlimited'
                      : planLimits.maxTollFreeNumbers}
                  </span>
                </div>
                {planLimits.maxTollFreeNumbers === 0 ? (
                  <Badge variant="outline" className="mt-2">
                    Not Available
                  </Badge>
                ) : planLimits.canPurchaseTollFree ? (
                  <Badge variant="secondary" className="mt-2">
                    Available
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="mt-2">
                    Limit Reached
                  </Badge>
                )}
              </div>

              {/* Sender IDs */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">Sender IDs</span>
                  <Hash className="text-muted-foreground h-4 w-4" />
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold">{planLimits.currentSenderIds}</span>
                  <span className="text-muted-foreground">
                    {' / '}
                    {planLimits.senderIdsAllowed ? 'Unlimited' : '0'}
                  </span>
                </div>
                {planLimits.senderIdsAllowed ? (
                  <Badge variant="secondary" className="mt-2">
                    Available
                  </Badge>
                ) : (
                  <Badge variant="outline" className="mt-2">
                    Enterprise Only
                  </Badge>
                )}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Senders List */}
      <SendersList />

      {/* Modals */}
      <PurchaseNumberModal open={showPurchaseModal} onOpenChange={setShowPurchaseModal} />
      <RegisterSenderIdModal open={showSenderIdModal} onOpenChange={setShowSenderIdModal} />
      <AddExistingNumberModal open={showAddExistingModal} onOpenChange={setShowAddExistingModal} />
    </div>
  );
}
