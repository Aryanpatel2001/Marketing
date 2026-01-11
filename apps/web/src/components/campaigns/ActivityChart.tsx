'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ActivityData {
  timestamp: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}

interface ActivityChartProps {
  data: ActivityData[];
  isLoading?: boolean;
}

export function ActivityChart({ data, isLoading }: ActivityChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activity Over Time</CardTitle>
          <CardDescription>Campaign engagement metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activity Over Time</CardTitle>
          <CardDescription>Campaign engagement metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-muted mb-4 rounded-full p-4">
              <svg
                className="text-muted-foreground h-8 w-8"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <p className="text-muted-foreground font-medium">No activity data available yet</p>
            <p className="text-muted-foreground mt-1 max-w-[200px] text-xs">
              Activity will show up here once your campaign starts sending.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/80 border-border/50 animate-in fade-in zoom-in min-w-[200px] rounded-xl border p-4 shadow-2xl backdrop-blur-md duration-200">
          <p className="text-foreground border-border mb-3 border-b pb-2 text-sm font-bold">
            {formatTimestamp(label)}
          </p>
          <div className="space-y-2">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full shadow-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-muted-foreground text-xs font-medium capitalize">
                    {entry.name}
                  </span>
                </div>
                <span className="text-foreground text-xs font-bold">
                  {entry.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="group relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-bold">Activity Performance</CardTitle>
          <CardDescription>Visual breakdown of campaign engagement</CardDescription>
        </div>
        <div className="text-muted-foreground bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Live Tracking
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradientOpened" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradientClicked" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/30" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={formatTimestamp}
              tick={{ fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
              className="text-muted-foreground"
            />
            <YAxis
              tick={{ fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              className="text-muted-foreground"
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: 'hsl(var(--muted))', strokeWidth: 1 }}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              // @ts-ignore
              iconSize={8}
              wrapperStyle={{
                paddingBottom: '20px',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            />

            {/* Primary volume indicators (Bars) */}
            <Bar
              dataKey="sent"
              fill="#10b981"
              radius={[4, 4, 0, 0]}
              barSize={30}
              name="Sent"
              animationDuration={1500}
            />
            <Bar
              dataKey="failed"
              fill="#f43f5e"
              radius={[4, 4, 0, 0]}
              barSize={30}
              name="Failed"
              animationDuration={1500}
            />
            <Bar
              dataKey="bounced"
              fill="#ef4444"
              radius={[4, 4, 0, 0]}
              barSize={30}
              name="Bounced"
              animationDuration={1500}
            />

            {/* Engagement metrics (Areas with curves) */}
            <Area
              type="monotone"
              dataKey="opened"
              stroke="#6366f1"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradientOpened)"
              name="Opened"
              animationDuration={2000}
            />
            <Area
              type="monotone"
              dataKey="clicked"
              stroke="#f59e0b"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradientClicked)"
              name="Clicked"
              animationDuration={2500}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
