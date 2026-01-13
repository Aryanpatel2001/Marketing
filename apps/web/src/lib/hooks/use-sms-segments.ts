import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SegmentCalculation, smsApi } from '../api/sms';

interface UseSmsSegmentsOptions {
  message: string;
  debounceMs?: number;
}

interface UseSmsSegmentsResult {
  segments: number;
  characters: number;
  encoding: 'GSM-7' | 'UCS-2' | null;
  remainingCharacters: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Custom hook for calculating SMS segments with debouncing
 * @param options - Configuration options
 * @returns Segment calculation result with loading state
 */
export function useSmsSegments({
  message,
  debounceMs = 300,
}: UseSmsSegmentsOptions): UseSmsSegmentsResult {
  const [debouncedMessage, setDebouncedMessage] = useState(message);

  // Debounce the message input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMessage(message);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [message, debounceMs]);

  // Fetch segment calculation
  const { data, isLoading, error } = useQuery<SegmentCalculation>({
    queryKey: ['sms-segments', debouncedMessage],
    queryFn: () => smsApi.calculateSegments({ message: debouncedMessage }),
    enabled: debouncedMessage.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });

  // Return default values if message is empty
  if (message.length === 0) {
    return {
      segments: 0,
      characters: 0,
      encoding: null,
      remainingCharacters: 0,
      isLoading: false,
      error: null,
    };
  }

  return {
    segments: data?.segments ?? 0,
    characters: data?.length ?? message.length,
    encoding: data?.encoding ?? null,
    remainingCharacters: data?.remainingCharacters ?? 0,
    isLoading,
    error: error as Error | null,
  };
}
