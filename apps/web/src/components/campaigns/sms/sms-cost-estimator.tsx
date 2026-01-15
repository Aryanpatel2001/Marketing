'use client';

import { DollarSign, MessageSquare, Users } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useSmsSegments } from '@/lib/hooks/use-sms-segments';
import { cn } from '@/lib/utils';

interface SmsCostEstimatorProps {
  message: string;
  recipientCount: number;
  className?: string;
}

export function SmsCostEstimator({ message, recipientCount, className }: SmsCostEstimatorProps) {
  const { segments, isLoading: _isLoading } = useSmsSegments({ message });

  const totalMessages = segments * recipientCount;
  // Estimated cost per message (this should come from your pricing config)
  const costPerMessage = 0.01; // $0.01 per message
  const estimatedCost = totalMessages * costPerMessage;

  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5" />
          Cost Estimate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Calculation Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Segments per message
            </div>
            <div className="font-medium">{segments}</div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recipients
            </div>
            <div className="font-medium">{recipientCount.toLocaleString()}</div>
          </div>

          <Separator />

          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">Total messages</div>
            <div className="font-medium">
              {segments} × {recipientCount.toLocaleString()} = {totalMessages.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="bg-primary/10 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Estimated Cost</span>
            <span className="text-primary text-xl font-bold">${estimatedCost.toFixed(2)}</span>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Based on ${costPerMessage.toFixed(3)} per message
          </p>
        </div>

        {/* Warning for high segment count */}
        {segments > 1 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/20">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              ⚠️ This message will be sent as {segments} segments. Consider shortening to reduce
              costs.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
