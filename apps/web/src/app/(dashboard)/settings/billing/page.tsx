'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CreditCard,
  Wallet,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  usePlans,
  useSubscription,
  useWallet,
  useUsage,
  useTransactions,
  useInvoices,
  useCreateCheckoutSession,
  useCreateTopUpSession,
  useCreateBillingPortalSession,
  useCancelSubscription,
  useReactivateSubscription,
} from '@/lib/hooks/use-billing';
import type { Plan, PlanTier } from '@/lib/api/billing';

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDate(dateString: string | null) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PlanCard({
  plan,
  currentTier,
  onSelect,
}: {
  plan: Plan;
  currentTier?: PlanTier;
  onSelect: (tier: PlanTier) => void;
}) {
  const isCurrent = plan.tier === currentTier;
  const isPopular = plan.tier === 'growth';

  return (
    <Card
      className={`relative ${isCurrent ? 'border-primary' : ''} ${isPopular ? 'border-2 border-blue-500' : ''}`}
    >
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-500">Most Popular</Badge>
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {plan.name}
          {isCurrent && <Badge variant="outline">Current</Badge>}
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-bold">
          {plan.price === 0 ? 'Free' : `${formatCurrency(plan.price)}/mo`}
        </div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {plan.smsQuota === -1 ? 'Unlimited' : plan.smsQuota.toLocaleString()} SMS/month
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {plan.emailQuota === -1 ? 'Unlimited' : plan.emailQuota.toLocaleString()} Emails/month
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {plan.whatsappQuota === -1 ? 'Unlimited' : plan.whatsappQuota.toLocaleString()}{' '}
            WhatsApp/month
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {plan.maxContacts === -1 ? 'Unlimited' : plan.maxContacts.toLocaleString()} Contacts
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            {plan.maxSenders === -1 ? 'Unlimited' : plan.maxSenders} Senders
          </li>
          {plan.features.apiAccess && (
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              API Access
            </li>
          )}
          {plan.features.prioritySupport && (
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Priority Support
            </li>
          )}
        </ul>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          variant={isCurrent ? 'outline' : isPopular ? 'default' : 'outline'}
          disabled={isCurrent || plan.tier === 'enterprise'}
          onClick={() => onSelect(plan.tier)}
        >
          {isCurrent ? 'Current Plan' : plan.tier === 'enterprise' ? 'Contact Sales' : 'Upgrade'}
        </Button>
      </CardFooter>
    </Card>
  );
}

function UsageCard({
  title,
  used,
  limit,
  icon: Icon,
}: {
  title: string;
  used: number;
  limit: number;
  icon: React.ElementType;
}) {
  const percentage = limit === -1 ? 0 : Math.min(100, (used / limit) * 100);
  const isUnlimited = limit === -1;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="text-muted-foreground h-4 w-4" />
            <span className="text-sm font-medium">{title}</span>
          </div>
          <span className="text-muted-foreground text-sm">
            {used.toLocaleString()} / {isUnlimited ? 'Unlimited' : limit.toLocaleString()}
          </span>
        </div>
        <Progress value={percentage} className="h-2" />
        {!isUnlimited && percentage >= 80 && (
          <p className="mt-1 text-xs text-orange-500">
            {percentage >= 100 ? 'Quota exceeded' : 'Approaching limit'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get('success');
  const topupSuccess = searchParams.get('topup');

  const [topUpAmount, setTopUpAmount] = useState('25');
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { data: plans, isLoading: plansLoading } = usePlans();
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription();
  const { data: wallet, isLoading: walletLoading } = useWallet();
  const { data: usage, isLoading: usageLoading } = useUsage();
  const { data: transactions } = useTransactions({ limit: 5 });
  const { data: invoices } = useInvoices(20);

  const createCheckout = useCreateCheckoutSession();
  const createTopUp = useCreateTopUpSession();
  const openBillingPortal = useCreateBillingPortalSession();
  const cancelSubscription = useCancelSubscription();
  const reactivateSubscription = useReactivateSubscription();

  const handleUpgrade = (planTier: PlanTier) => {
    if (planTier !== 'free') {
      createCheckout.mutate(planTier);
    }
  };

  const handleTopUp = () => {
    const amount = parseFloat(topUpAmount);
    if (amount >= 5) {
      createTopUp.mutate(amount);
    }
  };

  const handleCancel = () => {
    cancelSubscription.mutate({ cancelAtPeriodEnd: true });
    setShowCancelDialog(false);
  };

  const isLoading = plansLoading || subscriptionLoading || walletLoading || usageLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Usage</h1>
        <p className="text-muted-foreground">Manage your subscription, wallet, and usage.</p>
      </div>

      {success === 'true' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-green-600">Your subscription has been updated successfully!</span>
        </div>
      )}

      {topupSuccess === 'success' && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="text-green-600">Wallet topped up successfully!</span>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Current Plan */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
                <CreditCard className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">
                  {subscription?.planName || 'Free'}
                </div>
                <p className="text-muted-foreground text-xs">
                  {subscription?.status === 'trialing' && (
                    <span className="text-orange-500">
                      Trial ends {formatDate(subscription.trialEnd)}
                    </span>
                  )}
                  {subscription?.status === 'active' && (
                    <span>Renews {formatDate(subscription.currentPeriodEnd)}</span>
                  )}
                  {subscription?.cancelAtPeriodEnd && (
                    <span className="text-red-500">
                      Cancels {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* Wallet Balance */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
                <Wallet className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {wallet ? formatCurrency(wallet.availableBalance, wallet.currency) : '$0.00'}
                </div>
                <p className="text-muted-foreground text-xs">
                  {wallet && wallet.reservedBalance && wallet.reservedBalance > 0 && (
                    <span>{formatCurrency(wallet.reservedBalance)} reserved</span>
                  )}
                </p>
              </CardContent>
            </Card>

            {/* This Month's Cost */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <TrendingUp className="text-muted-foreground h-4 w-4" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usage ? formatCurrency(usage.totalCost) : '$0.00'}
                </div>
                <p className="text-muted-foreground text-xs">Total usage cost</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Wallet className="mr-2 h-4 w-4" />
                  Top Up Wallet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Top Up Wallet</DialogTitle>
                  <DialogDescription>
                    Add funds to your wallet for pay-as-you-go messaging.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (USD)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min="5"
                      step="5"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">Minimum $5.00</p>
                  </div>
                  <div className="flex gap-2">
                    {[10, 25, 50, 100].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        onClick={() => setTopUpAmount(amount.toString())}
                      >
                        ${amount}
                      </Button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleTopUp} disabled={createTopUp.isPending}>
                    {createTopUp.isPending
                      ? 'Processing...'
                      : `Pay ${formatCurrency(parseFloat(topUpAmount) || 0)}`}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="outline" onClick={() => openBillingPortal.mutate()}>
              <CreditCard className="mr-2 h-4 w-4" />
              Manage Payment Methods
            </Button>

            {subscription?.cancelAtPeriodEnd ? (
              <Button
                variant="outline"
                onClick={() => reactivateSubscription.mutate()}
                disabled={reactivateSubscription.isPending}
              >
                Reactivate Subscription
              </Button>
            ) : (
              subscription?.status === 'active' &&
              subscription?.planTier !== 'free' && (
                <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" className="text-red-500 hover:text-red-600">
                      Cancel Subscription
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel Subscription</DialogTitle>
                      <DialogDescription>
                        Your subscription will remain active until the end of the current billing
                        period. You can reactivate anytime before then.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
                        Keep Subscription
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleCancel}
                        disabled={cancelSubscription.isPending}
                      >
                        {cancelSubscription.isPending ? 'Cancelling...' : 'Cancel Subscription'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )
            )}
          </div>

          {/* Usage Summary */}
          {usage && (
            <div className="grid gap-4 md:grid-cols-3">
              <UsageCard title="SMS" used={usage.sms.used} limit={usage.sms.limit} icon={Zap} />
              <UsageCard
                title="Email"
                used={usage.email.used}
                limit={usage.email.limit}
                icon={Zap}
              />
              <UsageCard
                title="WhatsApp"
                used={usage.whatsapp.used}
                limit={usage.whatsapp.limit}
                icon={Zap}
              />
            </div>
          )}

          {/* Recent Transactions */}
          {transactions && transactions.data.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {transactions.data.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between border-b py-2 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{tx.description || tx.type}</p>
                        <p className="text-muted-foreground text-xs">{formatDate(tx.createdAt)}</p>
                      </div>
                      <span
                        className={`font-medium ${tx.type === 'credit' || tx.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {tx.type === 'credit' || tx.type === 'refund' ? '+' : '-'}
                        {formatCurrency(Math.abs(tx.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans
              ?.filter((p) => p.tier !== 'enterprise')
              .map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  currentTier={subscription?.planTier}
                  onSelect={handleUpgrade}
                />
              ))}
          </div>
          <Card className="bg-gradient-to-r from-purple-500/10 to-blue-500/10">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <h3 className="text-lg font-semibold">Enterprise</h3>
                <p className="text-muted-foreground">Custom solutions for large organizations</p>
              </div>
              <Button variant="outline">Contact Sales</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wallet Tab */}
        <TabsContent value="wallet" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Wallet Balance</CardTitle>
                <CardDescription>Your pay-as-you-go balance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-4xl font-bold">
                  {wallet ? formatCurrency(wallet.availableBalance, wallet.currency) : '$0.00'}
                </div>
                {wallet && wallet.reservedBalance && wallet.reservedBalance > 0 && (
                  <p className="text-muted-foreground text-sm">
                    {formatCurrency(wallet.reservedBalance)} reserved for pending campaigns
                  </p>
                )}
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Total Credited</p>
                    <p className="font-medium">
                      {wallet ? formatCurrency(wallet.totalCredited) : '$0.00'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Used</p>
                    <p className="font-medium">
                      {wallet ? formatCurrency(wallet.totalDebited) : '$0.00'}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="w-full">
                      <ArrowUpRight className="mr-2 h-4 w-4" />
                      Add Funds
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Top Up Wallet</DialogTitle>
                      <DialogDescription>
                        Add funds to your wallet for pay-as-you-go messaging.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="wallet-amount">Amount (USD)</Label>
                        <Input
                          id="wallet-amount"
                          type="number"
                          min="5"
                          step="5"
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        {[10, 25, 50, 100].map((amount) => (
                          <Button
                            key={amount}
                            variant="outline"
                            size="sm"
                            onClick={() => setTopUpAmount(amount.toString())}
                          >
                            ${amount}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleTopUp} disabled={createTopUp.isPending}>
                        {createTopUp.isPending
                          ? 'Processing...'
                          : `Pay ${formatCurrency(parseFloat(topUpAmount) || 0)}`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Auto-Recharge</CardTitle>
                <CardDescription>Automatically top up when balance is low</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <Badge variant={wallet?.autoRechargeEnabled ? 'default' : 'secondary'}>
                    {wallet?.autoRechargeEnabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                {wallet?.autoRechargeEnabled && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Recharge when below</span>
                      <span>{formatCurrency(wallet.autoRechargeThreshold)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Recharge amount</span>
                      <span>{formatCurrency(wallet.autoRechargeAmount)}</span>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openBillingPortal.mutate()}
                >
                  Configure Auto-Recharge
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Transaction History */}
          <Card>
            <CardHeader>
              <CardTitle>Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions && transactions.data.length > 0 ? (
                <div className="space-y-2">
                  {transactions.data.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between border-b py-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-full p-2 ${tx.type === 'credit' || tx.type === 'refund' ? 'bg-green-100 dark:bg-green-900' : 'bg-red-100 dark:bg-red-900'}`}
                        >
                          {tx.type === 'credit' || tx.type === 'refund' ? (
                            <ArrowUpRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 rotate-180 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{tx.description || tx.type}</p>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(tx.createdAt)}
                            {tx.channel && ` \u2022 ${tx.channel.toUpperCase()}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${tx.type === 'credit' || tx.type === 'refund' ? 'text-green-600' : ''}`}
                        >
                          {tx.type === 'credit' || tx.type === 'refund' ? '+' : '-'}
                          {formatCurrency(Math.abs(tx.amount))}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          Balance: {formatCurrency(tx.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center">No transactions yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          {usage && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">SMS Usage</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {usage.sms.used.toLocaleString()} /{' '}
                      {usage.sms.limit === -1 ? 'Unlimited' : usage.sms.limit.toLocaleString()}
                    </div>
                    <Progress value={usage.sms.percentUsed} className="h-2" />
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>{usage.sms.remaining.toLocaleString()} remaining</span>
                      <span>Cost: {formatCurrency(usage.sms.cost)}</span>
                    </div>
                    {usage.sms.overage > 0 && (
                      <p className="text-xs text-orange-500">
                        {usage.sms.overage.toLocaleString()} messages over quota
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Email Usage</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {usage.email.used.toLocaleString()} /{' '}
                      {usage.email.limit === -1 ? 'Unlimited' : usage.email.limit.toLocaleString()}
                    </div>
                    <Progress value={usage.email.percentUsed} className="h-2" />
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>{usage.email.remaining.toLocaleString()} remaining</span>
                      <span>Cost: {formatCurrency(usage.email.cost)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">WhatsApp Usage</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {usage.whatsapp.used.toLocaleString()} /{' '}
                      {usage.whatsapp.limit === -1
                        ? 'Unlimited'
                        : usage.whatsapp.limit.toLocaleString()}
                    </div>
                    <Progress value={usage.whatsapp.percentUsed} className="h-2" />
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span>{usage.whatsapp.remaining.toLocaleString()} remaining</span>
                      <span>Cost: {formatCurrency(usage.whatsapp.cost)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Contacts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {usage.contacts.used.toLocaleString()} /{' '}
                      {usage.contacts.limit === -1
                        ? 'Unlimited'
                        : usage.contacts.limit.toLocaleString()}
                    </div>
                    <Progress value={usage.contacts.percentUsed} className="h-2" />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Campaigns This Month</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">
                      {usage.campaigns.used} /{' '}
                      {usage.campaigns.limit === -1 ? 'Unlimited' : usage.campaigns.limit}
                    </div>
                    <Progress value={usage.campaigns.percentUsed} className="h-2" />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Billing Period</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Clock className="text-muted-foreground h-5 w-5" />
                    <div>
                      <p className="font-medium">
                        {formatDate(usage.periodStart)} - {formatDate(usage.periodEnd)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Total cost this period: {formatCurrency(usage.totalCost)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Invoice History</CardTitle>
              <CardDescription>View and download your past invoices</CardDescription>
            </CardHeader>
            <CardContent>
              {invoices && invoices.data.length > 0 ? (
                <div className="space-y-2">
                  {invoices.data.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between border-b py-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-muted rounded-full p-2">
                          <CreditCard className="text-muted-foreground h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{invoice.invoiceNumber}</p>
                          <p className="text-muted-foreground text-xs">
                            {formatDate(invoice.createdAt)}
                            {invoice.periodStart && invoice.periodEnd && (
                              <span>
                                {' '}
                                &bull; {formatDate(invoice.periodStart)} -{' '}
                                {formatDate(invoice.periodEnd)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-medium">
                            {formatCurrency(invoice.total, invoice.currency)}
                          </p>
                          <Badge
                            variant={
                              invoice.status === 'paid'
                                ? 'default'
                                : invoice.status === 'open'
                                  ? 'secondary'
                                  : invoice.status === 'void'
                                    ? 'outline'
                                    : 'destructive'
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          {invoice.invoiceUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(invoice.invoiceUrl!, '_blank')}
                            >
                              View
                            </Button>
                          )}
                          {invoice.pdfUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(invoice.pdfUrl!, '_blank')}
                            >
                              PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground py-8 text-center">No invoices yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
