'use client';

import { Check, ExternalLink, Phone, Hash } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SmsSenderStatus, SmsSenderType } from '@/lib/api/sms';
import { useSmsSenders } from '@/lib/hooks/use-sms-senders';
import { cn } from '@/lib/utils';

interface SenderSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SenderIdSelector({ value, onChange, className }: SenderSelectorProps) {
  const { data: sendersData, isLoading } = useSmsSenders({ status: SmsSenderStatus.ACTIVE });

  const activeSenders = sendersData?.data || [];

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Label>SMS Sender</Label>
        <div className="bg-muted h-10 animate-pulse rounded-md" />
      </div>
    );
  }

  const getSenderDisplay = (sender: any) => {
    if (sender.type === SmsSenderType.SENDER_ID) {
      return sender.senderId;
    }
    return sender.phoneNumber;
  };

  const getSenderIcon = (type: SmsSenderType) => {
    if (type === SmsSenderType.SENDER_ID) {
      return <Hash className="h-3 w-3" />;
    }
    return <Phone className="h-3 w-3" />;
  };

  const getSenderTypeLabel = (type: SmsSenderType) => {
    switch (type) {
      case SmsSenderType.DEDICATED_NUMBER:
        return 'Dedicated';
      case SmsSenderType.TOLL_FREE:
        return 'Toll-Free';
      case SmsSenderType.SENDER_ID:
        return 'Sender ID';
      default:
        return '';
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <Label htmlFor="sender">SMS Sender</Label>
        <Button variant="link" size="sm" className="h-auto p-0" asChild>
          <a href="/settings/sms/senders" target="_blank" rel="noopener noreferrer">
            Manage Senders
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>

      {activeSenders.length > 0 ? (
        <Select
          value={value || 'default'}
          onValueChange={(val) => onChange(val === 'default' ? '' : val)}
        >
          <SelectTrigger id="sender">
            <SelectValue placeholder="Select a sender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">
              <span className="text-muted-foreground">Use default sender</span>
            </SelectItem>
            {activeSenders.map((sender) => (
              <SelectItem key={sender.id} value={sender.id}>
                <div className="flex items-center gap-2">
                  {getSenderIcon(sender.type)}
                  <span className="font-mono">{getSenderDisplay(sender)}</span>
                  <Badge variant="outline" className="text-xs">
                    {getSenderTypeLabel(sender.type)}
                  </Badge>
                  {sender.isDefault && <Check className="ml-1 h-3 w-3 text-green-600" />}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="border-muted-foreground/30 bg-muted/50 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground mb-2 text-sm">
            No active senders available. Purchase a phone number or register a sender ID to send SMS
            campaigns.
          </p>
          <Button variant="outline" size="sm" asChild>
            <a href="/settings/sms/senders" target="_blank" rel="noopener noreferrer">
              Add Sender
              <ExternalLink className="ml-2 h-3 w-3" />
            </a>
          </Button>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        Select which phone number or sender ID to use for this campaign.
      </p>
    </div>
  );
}
