/* ──────────────────────────────────────────────
   Kairo — usePositions Hook
   Fetches the authenticated user's positions
   ────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import type { Position } from "@/lib/types";
import { fetchPositions } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface UsePositionsReturn {
  positions: Position[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePositions(): UsePositionsReturn {
  const { isAuthenticated } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchPositions();

      if (mountedRef.current) {
        setPositions(response.positions);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : "Failed to fetch positions";
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
      // Reset when user logs out
      setPositions([]);
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

  return { positions, isLoading, error, refetch };
}
