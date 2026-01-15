'use client';

import { format } from 'date-fns';
import { Check, Clock, Hash, MoreHorizontal, Phone, Star, Trash2, XCircle } from 'lucide-react';
import { useState } from 'react';

import { ConfirmationDialog } from '@/components/common/confirmation-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SmsSender, SmsSenderStatus, SmsSenderType } from '@/lib/api/sms';
import { useReleaseSender, useSetDefaultSender, useSmsSenders } from '@/lib/hooks/use-sms-senders';

const STATUS_CONFIG = {
  [SmsSenderStatus.ACTIVE]: {
    label: 'Active',
    icon: Check,
    className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  },
  [SmsSenderStatus.PENDING]: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  },
  [SmsSenderStatus.SUSPENDED]: {
    label: 'Suspended',
    icon: XCircle,
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  },
  [SmsSenderStatus.FAILED]: {
    label: 'Failed',
    icon: XCircle,
    className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  },
  [SmsSenderStatus.RELEASED]: {
    label: 'Released',
    icon: XCircle,
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  },
};

const TYPE_CONFIG = {
  [SmsSenderType.DEDICATED_NUMBER]: {
    label: 'Dedicated',
    icon: Phone,
    color: 'blue',
  },
  [SmsSenderType.TOLL_FREE]: {
    label: 'Toll-Free',
    icon: Phone,
    color: 'green',
  },
  [SmsSenderType.SENDER_ID]: {
    label: 'Sender ID',
    icon: Hash,
    color: 'purple',
  },
};

type FilterType = 'all' | SmsSenderType;

export function SendersList() {
  const [activeTab, setActiveTab] = useState<FilterType>('all');
  const [senderToDelete, setSenderToDelete] = useState<SmsSender | null>(null);

  const { data: sendersData, isLoading } = useSmsSenders();
  const setDefaultMutation = useSetDefaultSender();
  const releaseMutation = useReleaseSender();

  const senders = sendersData?.data || [];

  const filteredSenders = senders.filter((s) => {
    if (activeTab === 'all') return true;
    return s.type === activeTab;
  });

  const dedicatedCount = senders.filter((s) => s.type === SmsSenderType.DEDICATED_NUMBER).length;
  const tollFreeCount = senders.filter((s) => s.type === SmsSenderType.TOLL_FREE).length;
  const senderIdCount = senders.filter((s) => s.type === SmsSenderType.SENDER_ID).length;

  const handleSetDefault = async (sender: SmsSender) => {
    await setDefaultMutation.mutateAsync(sender.id);
  };

  const handleRelease = async () => {
    if (senderToDelete) {
      await releaseMutation.mutateAsync(senderToDelete.id);
      setSenderToDelete(null);
    }
  };

  const getSenderDisplay = (sender: SmsSender) => {
    if (sender.type === SmsSenderType.SENDER_ID) {
      return sender.senderId;
    }
    return sender.phoneNumber;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!senders || senders.length === 0) {
    return (
      <EmptyState
        icon={Phone}
        title="No SMS senders yet"
        description="Purchase a phone number or register a sender ID to start sending SMS campaigns."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Type Filter Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterType)}>
        <TabsList>
          <TabsTrigger value="all">All ({senders.length})</TabsTrigger>
          <TabsTrigger value={SmsSenderType.DEDICATED_NUMBER}>
            Dedicated ({dedicatedCount})
          </TabsTrigger>
          <TabsTrigger value={SmsSenderType.TOLL_FREE}>Toll-Free ({tollFreeCount})</TabsTrigger>
          <TabsTrigger value={SmsSenderType.SENDER_ID}>Sender ID ({senderIdCount})</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Senders Table */}
      <Card>
        <CardContent className="p-0">
          {filteredSenders.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sender</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-right">Delivery Rate</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSenders.map((sender) => {
                  const statusConfig = STATUS_CONFIG[sender.status];
                  const typeConfig = TYPE_CONFIG[sender.type];
                  const StatusIcon = statusConfig.icon;
                  const TypeIcon = typeConfig.icon;

                  return (
                    <TableRow key={sender.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{getSenderDisplay(sender)}</span>
                          {sender.isDefault && (
                            <Badge variant="secondary" className="text-xs">
                              <Star className="mr-1 h-3 w-3 fill-current" />
                              Default
                            </Badge>
                          )}
                        </div>
                        {sender.friendlyName &&
                          sender.friendlyName !== getSenderDisplay(sender) && (
                            <p className="text-muted-foreground text-sm">{sender.friendlyName}</p>
                          )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {typeConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusConfig.className}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {sender.messagesSent.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            sender.deliveryRate >= 95
                              ? 'text-green-600'
                              : sender.deliveryRate >= 90
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }
                        >
                          {sender.deliveryRate.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(sender.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!sender.isDefault && sender.status === SmsSenderStatus.ACTIVE && (
                              <DropdownMenuItem onClick={() => handleSetDefault(sender)}>
                                <Star className="mr-2 h-4 w-4" />
                                Set as Default
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setSenderToDelete(sender)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Release
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">No senders found for this filter.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={!!senderToDelete}
        onOpenChange={(open) => !open && setSenderToDelete(null)}
        title="Release Sender"
        description={
          senderToDelete?.type === SmsSenderType.SENDER_ID
            ? `Are you sure you want to release sender ID "${senderToDelete.senderId}"? This action cannot be undone.`
            : `Are you sure you want to release ${senderToDelete?.phoneNumber}? You will lose this phone number and may not be able to get it back.`
        }
        confirmLabel="Release"
        onConfirm={handleRelease}
        loading={releaseMutation.isPending}
        variant="destructive"
      />
    </div>
  );
}
