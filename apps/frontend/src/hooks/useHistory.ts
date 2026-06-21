/* ──────────────────────────────────────────────
   Kairo — useHistory Hook
   Fetches the authenticated user's order history
   ────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import type { OrderHistory } from "@/lib/types";
import { fetchHistory } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface UseHistoryReturn {
  history: OrderHistory[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useHistory(): UseHistoryReturn {
  const { isAuthenticated } = useAuth();
  const [history, setHistory] = useState<OrderHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchHistory();

      if (mountedRef.current) {
        setHistory(response.history);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Failed to fetch order history";
        setError(message);
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    mountedRef.current = true;

    if (isAuthenticated) {
      load();
    } else {
      setHistory([]);
      setError(null);
      setIsLoading(false);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isAuthenticated, load]);

  const refetch = useCallback(() => {
    load();
  }, [load]);

  return { history, isLoading, error, refetch };
}
