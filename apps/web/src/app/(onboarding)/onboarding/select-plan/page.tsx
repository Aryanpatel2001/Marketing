'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Zap, Building2, Rocket, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { billingApi, Plan, PlanTier } from '@/lib/api/billing';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';

const planIcons: Record<PlanTier, React.ReactNode> = {
  free: <Zap className="h-6 w-6" />,
  starter: <Rocket className="h-6 w-6" />,
  growth: <Building2 className="h-6 w-6" />,
  pro: <Crown className="h-6 w-6" />,
  enterprise: <Crown className="h-6 w-6" />,
};

const planColors: Record<PlanTier, string> = {
  free: 'border-gray-200',
  starter: 'border-blue-200',
  growth: 'border-purple-200',
  pro: 'border-amber-200',
  enterprise: 'border-gray-200',
};

const selectedPlanColors: Record<PlanTier, string> = {
  free: 'border-gray-500 bg-gray-50',
  starter: 'border-blue-500 bg-blue-50',
  growth: 'border-purple-500 bg-purple-50',
  pro: 'border-amber-500 bg-amber-50',
  enterprise: 'border-gray-500 bg-gray-50',
};

export default function SelectPlanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cancelled = searchParams.get('cancelled');
  const { setRequiresOnboarding } = useAuthStore();

  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('starter');

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: billingApi.getPlans,
  });

  const checkoutMutation = useMutation({
    mutationFn: (planTier: PlanTier) => billingApi.createOnboardingCheckout(planTier),
    onSuccess: (data) => {
      // For free plan (sessionId === 'free-plan'), clear onboarding flag before redirect
      if (data.sessionId === 'free-plan') {
        setRequiresOnboarding(false);
      }
      // Redirect to Stripe Checkout or dashboard (for free plan)
      window.location.href = data.url;
    },
  });

  const handleContinue = () => {
    checkoutMutation.mutate(selectedPlan);
  };

  const formatNumber = (num: number): string => {
    if (num === -1) return 'Unlimited';
    if (num >= 1000000) return `${(num / 1000000).toFixed(0)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
    return num.toString();
  };

  if (plansLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight">Choose your plan</h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            Start with a 14-day free trial on any paid plan. No charges until the trial ends. Cancel
            anytime.
          </p>
          {cancelled && (
            <div className="mt-4 inline-block rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-sm text-yellow-800">
                Checkout was cancelled. Please select a plan to continue.
              </p>
            </div>
          )}
        </div>

        {/* Plans Grid */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans
            ?.filter((p) => p.tier !== 'enterprise')
            .map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  'relative cursor-pointer transition-all hover:shadow-lg',
                  planColors[plan.tier],
                  selectedPlan === plan.tier && selectedPlanColors[plan.tier]
                )}
                onClick={() => setSelectedPlan(plan.tier)}
              >
                {plan.tier === 'growth' && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600">
                    Most Popular
                  </Badge>
                )}

                <CardHeader className="pb-2 text-center">
                  <div className="bg-muted mx-auto mb-3 w-fit rounded-full p-3">
                    {planIcons[plan.tier]}
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="mb-6 text-center">
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                    {plan.tier !== 'free' && plan.trialDays > 0 && (
                      <p className="mt-1 text-sm text-green-600">{plan.trialDays}-day free trial</p>
                    )}
                  </div>

                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>{formatNumber(plan.emailQuota)} emails/month</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>{formatNumber(plan.smsQuota)} SMS/month</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>{formatNumber(plan.maxContacts)} contacts</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                      <span>{plan.maxUsers} team members</span>
                    </li>
                    {plan.features.apiAccess && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                        <span>API access</span>
                      </li>
                    )}
                    {plan.features.advancedAnalytics && (
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                        <span>Advanced analytics</span>
                      </li>
                    )}
                  </ul>

                  {/* Selection indicator */}
                  <div className="mt-6 flex justify-center">
                    <div
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border-2',
                        selectedPlan === plan.tier
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/30'
                      )}
                    >
                      {selectedPlan === plan.tier && (
                        <Check className="text-primary-foreground h-4 w-4" />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>

        {/* Continue Button */}
        <div className="text-center">
          <Button
            size="lg"
            className="min-w-[200px]"
            onClick={handleContinue}
            disabled={checkoutMutation.isPending}
          >
            {checkoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : selectedPlan === 'free' ? (
              'Start with Free Plan'
            ) : (
              'Start 14-Day Free Trial'
            )}
          </Button>
          <p className="text-muted-foreground mt-3 text-sm">
            {selectedPlan === 'free'
              ? 'No credit card required'
              : 'Credit card required. Cancel anytime during trial.'}
          </p>
        </div>

        {/* Enterprise CTA */}
        <div className="bg-muted/50 mt-12 rounded-lg p-6 text-center">
          <h3 className="mb-2 font-semibold">Need more?</h3>
          <p className="text-muted-foreground mb-4">
            Contact us for custom enterprise pricing with unlimited everything.
          </p>
          <Button variant="outline">Contact Sales</Button>
        </div>
      </div>
    </div>
  );
}
