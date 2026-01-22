'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Processing authentication...');
  const { setTokens, setUser } = useAuthStore();

  useEffect(() => {
    const handleCallback = async () => {
      const success = searchParams.get('success');
      const provider = searchParams.get('provider');
      const error = searchParams.get('error');

      // Handle error case
      if (error) {
        setStatus('error');
        setMessage(decodeURIComponent(error));
        setTimeout(() => router.push('/login'), 3000);
        return;
      }

      // Handle success case - fetch tokens from cookies
      if (success === 'true') {
        try {
          setMessage('Retrieving your session...');

          // Fetch tokens from the secure cookie endpoint
          const response = await fetch(`${API_URL}/api/v1/auth/tokens-from-cookies`, {
            method: 'GET',
            credentials: 'include', // Important: include cookies
          });

          if (!response.ok) {
            throw new Error('Failed to retrieve authentication tokens');
          }

          const data = await response.json();

          if (data.accessToken && data.refreshToken) {
            // Store tokens in localStorage
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);

            // Update Zustand store
            setTokens(data.accessToken, data.refreshToken);

            // Fetch user profile
            setMessage('Loading your profile...');
            const profileResponse = await fetch(`${API_URL}/api/v1/auth/me`, {
              headers: {
                Authorization: `Bearer ${data.accessToken}`,
              },
            });

            if (profileResponse.ok) {
              const profileData = await profileResponse.json();
              // Handle wrapped response format
              const user = profileData.data || profileData;
              setUser(user);
            }

            setStatus('success');
            setMessage(`Welcome back! Redirecting to dashboard...`);

            // Redirect to dashboard
            setTimeout(() => router.push('/dashboard'), 1500);
          } else {
            throw new Error('Invalid token response');
          }
        } catch (err) {
          console.error('OAuth callback error:', err);
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Authentication failed');
          setTimeout(() => router.push('/login'), 3000);
        }
      } else {
        // No success parameter - invalid callback
        setStatus('error');
        setMessage('Invalid authentication callback');
        setTimeout(() => router.push('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router, setTokens, setUser]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center">
      <div className="space-y-4 p-8 text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="text-primary mx-auto h-12 w-12 animate-spin" />
            <h1 className="text-xl font-semibold">{message}</h1>
            <p className="text-muted-foreground">Please wait...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="text-xl font-semibold text-green-600">{message}</h1>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="text-xl font-semibold text-red-600">Authentication Failed</h1>
            <p className="text-muted-foreground">{message}</p>
            <p className="text-muted-foreground text-sm">Redirecting to login...</p>
          </>
        )}
      </div>
    </div>
  );
}
