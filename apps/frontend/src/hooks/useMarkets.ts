/* ──────────────────────────────────────────────
   Kairo — useMarkets Hook
   Fetches all markets with loading/error/refetch
   ────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Market } from '@/lib/types';
import { fetchMarkets } from '@/lib/api';

interface UseMarketsReturn {
  markets: Market[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMarkets(): UseMarketsReturn {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchMarkets();

      if (mountedRef.current) {
        setMarkets(response.markets);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'object' && err !== null && 'message' in err
              ? String((err as { message: unknown }).message)
              : 'Failed to fetch markets';
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load();

    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return { markets, isLoading, error, refetch };
}
