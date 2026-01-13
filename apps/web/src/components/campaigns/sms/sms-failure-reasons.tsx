'use client';

import { AlertCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CampaignMessage } from '@/lib/api/campaigns';

interface SmsFailureReasonsProps {
  messages: CampaignMessage[];
}

interface ErrorSummary {
  code: string;
  message: string;
  count: number;
  percentage: number;
}

// Common SMS error codes and their descriptions
const ERROR_DESCRIPTIONS: Record<string, string> = {
  '30003': 'Unreachable destination - Phone number is invalid or not in service',
  '30004': 'Message blocked - Carrier has blocked the message',
  '30005': 'Unknown destination - Phone number could not be found',
  '30006': 'Landline or unreachable carrier',
  '30007': 'Carrier violation - Message content violates carrier policies',
  '30008': 'Unknown error from carrier',
  '21211': 'Invalid phone number',
  '21408': 'Permission to send has not been enabled',
  '21610': 'Message exceeds maximum length',
  '21614': 'Invalid sender ID',
};

export function SmsFailureReasons({ messages }: SmsFailureReasonsProps) {
  // Filter failed messages
  const failedMessages = messages.filter((m) => m.status === 'failed' && m.errorCode);

  if (failedMessages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failure Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
            No failures to analyze
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group by error code and count
  const errorMap = new Map<string, { count: number; message: string }>();

  failedMessages.forEach((msg) => {
    const code = msg.errorCode || 'UNKNOWN';
    const existing = errorMap.get(code);

    if (existing) {
      existing.count++;
    } else {
      errorMap.set(code, {
        count: 1,
        message: msg.errorMessage || ERROR_DESCRIPTIONS[code] || 'Unknown error',
      });
    }
  });

  // Convert to array and sort by count
  const errorSummaries: ErrorSummary[] = Array.from(errorMap.entries())
    .map(([code, data]) => ({
      code,
      message: data.message,
      count: data.count,
      percentage: (data.count / failedMessages.length) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 errors

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Top Failure Reasons
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Error Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Percentage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {errorSummaries.map((error) => (
              <TableRow key={error.code}>
                <TableCell>
                  <Badge variant="outline" className="font-mono">
                    {error.code}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="truncate" title={error.message}>
                    {error.message}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {error.count.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="secondary">{error.percentage.toFixed(1)}%</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="bg-muted/50 mt-4 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">
            <strong>Total Failures:</strong> {failedMessages.length.toLocaleString()} messages
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
