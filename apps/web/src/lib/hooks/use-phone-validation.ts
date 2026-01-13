import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PhoneValidationResult, smsApi } from '../api/sms';

interface UsePhoneValidationOptions {
  phoneNumber: string;
  countryCode?: string;
  debounceMs?: number;
}

interface UsePhoneValidationResult {
  isValid: boolean;
  formatted: string | null;
  country: string | null;
  isLoading: boolean;
  error: Error | null;
  result: PhoneValidationResult | null;
}

/**
 * Custom hook for validating phone numbers with debouncing
 * @param options - Configuration options
 * @returns Phone validation result with loading state
 */
export function usePhoneValidation({
  phoneNumber,
  countryCode,
  debounceMs = 500,
}: UsePhoneValidationOptions): UsePhoneValidationResult {
  const [debouncedPhone, setDebouncedPhone] = useState(phoneNumber);

  // Debounce the phone number input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPhone(phoneNumber);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [phoneNumber, debounceMs]);

  // Fetch validation result
  const { data, isLoading, error } = useQuery<PhoneValidationResult>({
    queryKey: ['phone-validation', debouncedPhone, countryCode],
    queryFn: () => smsApi.validatePhone({ phoneNumber: debouncedPhone, countryCode }),
    enabled: debouncedPhone.length > 0,
    staleTime: 300000, // Cache for 5 minutes
    retry: false, // Don't retry on validation errors
  });

  // Return default values if phone number is empty
  if (phoneNumber.length === 0) {
    return {
      isValid: false,
      formatted: null,
      country: null,
      isLoading: false,
      error: null,
      result: null,
    };
  }

  return {
    isValid: data?.isValid ?? false,
    formatted: data?.internationalFormat ?? null,
    country: data?.countryCode ?? null,
    isLoading,
    error: error as Error | null,
    result: data ?? null,
  };
}
