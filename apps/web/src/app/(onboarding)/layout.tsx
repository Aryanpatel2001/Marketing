'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { LoadingSpinner } from '@/components/common';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);

  // Wait for Zustand hydration
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Only redirect after hydration and loading is complete
    if (isHydrated && !isLoading && !isAuthenticated) {
      // Not authenticated - redirect to login
      const hasToken = localStorage.getItem('accessToken');
      if (!hasToken) {
        console.log('[Onboarding] No auth, redirecting to login');
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, isHydrated, router]);

  // Show loading while hydrating
  if (!isHydrated || isLoading) {
    return (
      <div className="from-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="from-background to-muted/20 flex min-h-screen items-center justify-center bg-gradient-to-b">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Simple layout for onboarding - no sidebar/header
  return (
    <div className="from-background to-muted/20 min-h-screen bg-gradient-to-b">{children}</div>
  );
}
