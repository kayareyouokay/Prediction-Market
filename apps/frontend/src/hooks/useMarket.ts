/* ──────────────────────────────────────────────
   Kairo — useMarket Hook
   Fetches a single market with optional polling
   for live orderbook updates
   ────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Market } from "@/lib/types";
import { fetchMarket } from "@/lib/api";

interface UseMarketOptions {
  /** Polling interval in milliseconds. Pass 0 or undefined to disable. */
  pollInterval?: number;
}

interface UseMarketReturn {
  market: Market | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useMarket(
  marketId: string,
  options: UseMarketOptions = {},
): UseMarketReturn {
  const { pollInterval } = options;

  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await fetchMarket(marketId);

        if (mountedRef.current) {
          setMarket(response.market);
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : typeof err === "object" && err !== null && "message" in err
                ? String((err as { message: unknown }).message)
                : "Failed to fetch market";
          setError(message);
        }
      } finally {
        if (mountedRef.current && !silent) {
          setIsLoading(false);
        }
      }
    },
    [marketId],
  );

  // Initial fetch + re-fetch when marketId changes
  useEffect(() => {
    mountedRef.current = true;
    setMarket(null);
    load();

    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Polling
  useEffect(() => {
    if (!pollInterval || pollInterval <= 0) return;

    const intervalId = setInterval(() => {
      // Silent reload — don't flash loading state
      load(true);
    }, pollInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [load, pollInterval]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return { market, isLoading, error, refetch };
}
