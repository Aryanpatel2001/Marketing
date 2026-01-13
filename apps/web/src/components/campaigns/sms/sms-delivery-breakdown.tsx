'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Campaign } from '@/lib/api/campaigns';

interface SmsDeliveryBreakdownProps {
  campaign: Campaign;
}

const COLORS = {
  delivered: '#10b981', // green
  failed: '#ef4444', // red
  pending: '#6b7280', // gray
};

export function SmsDeliveryBreakdown({ campaign }: SmsDeliveryBreakdownProps) {
  const delivered = campaign.deliveredCount || 0;
  const failed = campaign.failedCount || 0;
  const sent = campaign.sentCount || 0;
  const pending = Math.max(0, sent - delivered - failed);

  const data = [
    { name: 'Delivered', value: delivered, color: COLORS.delivered },
    { name: 'Failed', value: failed, color: COLORS.failed },
    { name: 'Pending', value: pending, color: COLORS.pending },
  ].filter((item) => item.value > 0);

  const total = delivered + failed + pending;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Delivery Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
            No delivery data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
                  '',
                ]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Stats Grid */}
          <div className="mt-6 grid w-full grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-500">
                {delivered.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-sm">Delivered</div>
              <div className="text-muted-foreground text-xs">
                {total > 0 ? ((delivered / total) * 100).toFixed(1) : 0}%
              </div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-500">
                {failed.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-sm">Failed</div>
              <div className="text-muted-foreground text-xs">
                {total > 0 ? ((failed / total) * 100).toFixed(1) : 0}%
              </div>
            </div>

            <div className="text-center">
              <div className="text-muted-foreground text-2xl font-bold">
                {pending.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-sm">Pending</div>
              <div className="text-muted-foreground text-xs">
                {total > 0 ? ((pending / total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
