'use client';

import { format } from 'date-fns';
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Download,
  FileText,
  History,
  Loader2,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BillingInterval, PlanInfo } from '@/lib/api/billing';
import {
  useCreateCheckout,
  useCreatePortalSession,
  useCreditPackages,
  useInvoices,
  usePlans,
  usePurchaseCredits,
  useSubscription,
  useTransactions,
  useWalletBalance,
} from '@/lib/hooks/use-billing';

// ============================================
// Plan Card Component
// ============================================

function PlanCard({
  plan,
  isCurrentPlan,
  onSelect,
  isLoading,
}: {
  plan: PlanInfo;
  isCurrentPlan: boolean;
  onSelect: () => void;
  isLoading: boolean;
  interval?: BillingInterval;
}) {
  const priceInDollars = plan.monthlyPrice / 100;

  return (
    <Card
      className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''} ${isCurrentPlan ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}`}
    >
      {plan.popular && !isCurrentPlan && (
        <Badge className="bg-primary absolute -top-2 left-1/2 -translate-x-1/2">
          <Sparkles className="mr-1 h-3 w-3" />
          Most Popular
        </Badge>
      )}
      {isCurrentPlan && (
        <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-600">
          <Check className="mr-1 h-3 w-3" />
          Current Plan
        </Badge>
      )}

      <CardHeader className="pt-6 text-center">
        <CardTitle className="text-xl">{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
        <div className="mt-4">
          <span className="text-4xl font-bold">${priceInDollars}</span>
          <span className="text-muted-foreground">/month</span>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="mb-6 space-y-3">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="text-muted-foreground mb-4 space-y-2 border-t pt-4 text-sm">
          <div className="flex justify-between">
            <span>Contacts</span>
            <span className="font-medium">{plan.limits.maxContacts.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>SMS/month</span>
            <span className="font-medium">
              {plan.limits.maxSmsPerMonth === -1
                ? 'Unlimited'
                : plan.limits.maxSmsPerMonth.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Team members</span>
            <span className="font-medium">{plan.limits.maxUsersPerTenant}</span>
          </div>
        </div>

        <Button
          className="w-full"
          variant={isCurrentPlan ? 'outline' : plan.popular ? 'default' : 'outline'}
          onClick={onSelect}
          disabled={isCurrentPlan || isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : isCurrentPlan ? (
            'Current Plan'
          ) : (
            'Upgrade'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================
// Wallet Section Component
// ============================================

function WalletSection() {
  const { data: balance, isLoading: balanceLoading } = useWalletBalance();
  const { data: packages, isLoading: packagesLoading } = useCreditPackages();
  const { data: transactions, isLoading: transactionsLoading } = useTransactions({ limit: 5 });
  const purchaseCredits = usePurchaseCredits();

  const handlePurchaseCredits = async (packageId: string) => {
    try {
      await purchaseCredits.mutateAsync({ packageId });
      // The mutation will show a toast on success/error
    } catch (error) {
      // Error already handled by mutation
    }
  };

  if (balanceLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Balance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            SMS Credits
          </CardTitle>
          <CardDescription>Your current credit balance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-primary text-4xl font-bold">
                {balance?.availableCredits.toLocaleString() || 0}
              </div>
              <p className="text-muted-foreground text-sm">Available credits</p>
            </div>

            {balance?.reservedCredits && balance.reservedCredits > 0 && (
              <div className="text-sm">
                <span className="text-muted-foreground">Reserved: </span>
                <span className="font-medium">{balance.reservedCredits}</span>
              </div>
            )}

            {balance?.isLowBalance && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-50 p-3 dark:bg-yellow-950">
                <Zap className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  Low balance! Consider buying more credits.
                </span>
              </div>
            )}

            <div className="pt-2">
              <p className="text-muted-foreground mb-2 text-xs">Lifetime credits used</p>
              <Progress value={Math.min(100, (balance?.lifetimeCredits || 0) / 100)} />
              <p className="text-muted-foreground mt-1 text-xs">
                {balance?.lifetimeCredits.toLocaleString() || 0} total credits used
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Buy Credits
          </CardTitle>
          <CardDescription>Choose a credit package</CardDescription>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {packages?.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePurchaseCredits(pkg.id)}
                  disabled={purchaseCredits.isPending}
                  className="hover:bg-accent flex w-full items-center justify-between rounded-lg border p-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="text-left">
                    <div className="font-medium">{pkg.credits.toLocaleString()} Credits</div>
                    <div className="text-muted-foreground text-sm">
                      ${(pkg.pricePerCredit / 100).toFixed(3)}/credit
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">${(pkg.price / 100).toFixed(2)}</div>
                    {pkg.discountPercent > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Save {pkg.discountPercent}%
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Transactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : transactions?.data && transactions.data.length > 0 ? (
            <div className="space-y-2">
              {transactions.data.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-muted/50 flex items-center justify-between rounded-lg p-3"
                >
                  <div>
                    <div className="font-medium">{tx.description}</div>
                    <div className="text-muted-foreground text-sm">
                      {format(new Date(tx.createdAt), 'MMM d, yyyy h:mm a')}
                    </div>
                  </div>
                  <div className={`font-bold ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.amount > 0 ? '+' : ''}
                    {tx.amount}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center">No transactions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// Invoices Section Component
// ============================================

function InvoicesSection() {
  const { data: invoicesData, isLoading } = useInvoices({ limit: 20 });

  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  const invoices = invoicesData?.data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Invoice History
        </CardTitle>
        <CardDescription>Download invoices for your records</CardDescription>
      </CardHeader>
      <CardContent>
        {invoices.length > 0 ? (
          <div className="space-y-2">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-muted rounded-lg p-2">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">
                      {invoice.invoiceNumber || `Invoice #${invoice.id.slice(0, 8)}`}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {format(new Date(invoice.createdAt), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold">${invoice.amount.toFixed(2)}</div>
                    <Badge
                      variant={invoice.status === 'paid' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {invoice.status}
                    </Badge>
                  </div>
                  {invoice.invoiceUrl && (
                    <a
                      href={invoice.invoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:bg-muted rounded-lg p-2 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center">
            No invoices yet. Invoices will appear here after your first payment.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Billing Page
// ============================================

export default function BillingPage() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(BillingInterval.MONTHLY);
  const { data: subscription, isLoading: subscriptionLoading } = useSubscription();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const createCheckout = useCreateCheckout();
  const createPortal = useCreatePortalSession();

  const handleUpgrade = (planId: string) => {
    createCheckout.mutate({
      plan: planId,
      interval: billingInterval,
      successUrl: `${window.location.origin}/settings/billing?success=true`,
      cancelUrl: `${window.location.origin}/settings/billing?canceled=true`,
    });
  };

  const handleManageSubscription = () => {
    createPortal.mutate(`${window.location.origin}/settings/billing`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing & Plans"
        description="Manage your subscription, credits, and payment methods"
      >
        {subscription?.stripeSubscriptionId && (
          <Button variant="outline" onClick={handleManageSubscription}>
            <ArrowUpRight className="mr-2 h-4 w-4" />
            Manage Subscription
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="plans" className="space-y-6">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="credits">SMS Credits</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        {/* Plans Tab */}
        <TabsContent value="plans" className="space-y-6">
          {/* Current Subscription Info */}
          {subscription && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">Current Plan</p>
                    <p className="text-2xl font-bold capitalize">{subscription.plan}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Status</p>
                    <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                      {subscription.status}
                    </Badge>
                  </div>
                  {subscription.currentPeriodEnd && (
                    <div>
                      <p className="text-muted-foreground text-sm">Next billing</p>
                      <p className="font-medium">
                        {format(new Date(subscription.currentPeriodEnd), 'MMM d, yyyy')}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Plan Cards */}
          {plansLoading || subscriptionLoading ? (
            <div className="grid gap-6 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-96 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plans?.map((plan) => (
                <PlanCard
                  key={plan.plan}
                  plan={plan}
                  isCurrentPlan={subscription?.plan === plan.plan}
                  onSelect={() => handleUpgrade(plan.plan)}
                  isLoading={createCheckout.isPending}
                  interval={BillingInterval.MONTHLY}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits">
          <WalletSection />
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <InvoicesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
