/* ──────────────────────────────────────────────
   Kairo — useTrading Hook
   Wraps order placement, split, and merge
   operations with shared loading/error state
   ────────────────────────────────────────────── */

import { useState, useCallback } from "react";
import type {
  CreateOrderRequest,
  SplitRequest,
  MergeRequest,
} from "@/lib/types";
import { placeOrder, splitPosition, mergePosition } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface UseTradingReturn {
  submitOrder: (data: CreateOrderRequest) => Promise<boolean>;
  submitSplit: (data: SplitRequest) => Promise<boolean>;
  submitMerge: (data: MergeRequest) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
  clearError: () => void;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

export function useTrading(): UseTradingReturn {
  const { refreshBalance } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const submitOrder = useCallback(
    async (data: CreateOrderRequest): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);

      try {
        await placeOrder(data);
        await refreshBalance();
        return true;
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshBalance],
  );

  const submitSplit = useCallback(
    async (data: SplitRequest): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);

      try {
        await splitPosition(data);
        await refreshBalance();
        return true;
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshBalance],
  );

  const submitMerge = useCallback(
    async (data: MergeRequest): Promise<boolean> => {
      setIsSubmitting(true);
      setError(null);

      try {
        await mergePosition(data);
        await refreshBalance();
        return true;
      } catch (err: unknown) {
        setError(extractErrorMessage(err));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [refreshBalance],
  );

  return {
    submitOrder,
    submitSplit,
    submitMerge,
    isSubmitting,
    error,
    clearError,
  };
}
