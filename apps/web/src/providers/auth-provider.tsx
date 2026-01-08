'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuthStore } from '@/store';
import { authApi } from '@/lib/api/auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading, setTokens, logout, accessToken, isAuthenticated, user } =
    useAuthStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const initRef = useRef(false);

  // Wait for Zustand to hydrate from localStorage
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    // Prevent double initialization
    if (initRef.current) return;
    initRef.current = true;

    const initAuth = async () => {
      // Check localStorage for tokens
      const storedAccessToken = localStorage.getItem('accessToken');
      const storedRefreshToken = localStorage.getItem('refreshToken');

      console.log('[Auth] Initializing...', {
        hasStoredAccessToken: !!storedAccessToken,
        hasStoredRefreshToken: !!storedRefreshToken,
        hasStoreAccessToken: !!accessToken,
        isAuthenticated,
        hasUser: !!user,
      });

      // Sync tokens to store if they exist in localStorage but not in store
      if (storedAccessToken && storedRefreshToken && !accessToken) {
        console.log('[Auth] Syncing tokens from localStorage to store');
        setTokens(storedAccessToken, storedRefreshToken);
      }

      const token = accessToken || storedAccessToken;

      if (!token) {
        console.log('[Auth] No token found, setting loading to false');
        setLoading(false);
        return;
      }

      // If we already have a user and are authenticated, just finish loading
      if (isAuthenticated && user) {
        console.log('[Auth] Already authenticated with user, skipping validation');
        setLoading(false);
        return;
      }

      try {
        console.log('[Auth] Validating token by fetching profile...');
        // Validate token by fetching user profile
        const fetchedUser = await authApi.getProfile();
        console.log('[Auth] Profile fetched successfully:', fetchedUser.email);
        setUser(fetchedUser);
      } catch (error: any) {
        // Check if we were redirected by the interceptor (tokens cleared)
        const currentToken = localStorage.getItem('accessToken');
        if (!currentToken) {
          console.log('[Auth] Tokens were cleared by interceptor (refresh failed)');
          // Don't call logout again, just set loading to false
          // The interceptor already cleared everything
        } else {
          // Token still exists but profile fetch failed for other reason
          console.error('[Auth] Profile fetch failed:', error?.message);
          logout();
        }
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [isHydrated]); // Only depend on isHydrated, not on store values to prevent loops

  // Don't render children until hydration is complete to prevent flash
  if (!isHydrated) {
    return null;
  }

  return <>{children}</>;
}
