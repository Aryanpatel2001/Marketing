'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store';

export default function OnboardingCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [isLoading, setIsLoading] = useState(true);
  const { setRequiresOnboarding } = useAuthStore();

  useEffect(() => {
    // Simulate verification delay
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, [sessionId]);

  const handleContinue = () => {
    // Clear onboarding flag before redirecting to dashboard
    setRequiresOnboarding(false);
    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="mx-4 w-full max-w-md">
          <CardContent className="pb-8 pt-8 text-center">
            <Loader2 className="text-primary mx-auto mb-4 h-12 w-12 animate-spin" />
            <h2 className="mb-2 text-xl font-semibold">Setting up your account...</h2>
            <p className="text-muted-foreground">This will only take a moment</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="mx-4 w-full max-w-lg">
        <CardHeader className="pb-2 text-center">
          <div className="mx-auto mb-4 w-fit rounded-full bg-green-100 p-4">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
          <CardTitle className="text-2xl">You&apos;re all set!</CardTitle>
          <CardDescription className="text-base">
            Your account has been successfully created and your subscription is active.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* What's next */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="mb-3 font-medium">What&apos;s next?</h3>
            <ul className="text-muted-foreground space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs">
                  1
                </span>
                <span>Import your contacts or add them manually</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs">
                  2
                </span>
                <span>Create your first email or SMS template</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-primary text-primary-foreground flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs">
                  3
                </span>
                <span>Launch your first marketing campaign</span>
              </li>
            </ul>
          </div>

          {/* Trial info */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <strong>Your 14-day trial has started!</strong>
              <br />
              You won&apos;t be charged until the trial ends. You can cancel anytime from Settings
              &rarr; Billing.
            </p>
          </div>

          {/* Continue button */}
          <Button size="lg" className="w-full" onClick={handleContinue}>
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
