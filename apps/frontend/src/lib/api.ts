/* ──────────────────────────────────────────────
   Kairo — Type-Safe API Client
   ────────────────────────────────────────────── */

import { getSupabaseClient } from './supabase';
import type {
  MarketsResponse,
  MarketResponse,
  BalanceResponse,
  PositionsResponse,
  HistoryResponse,
  MessageResponse,
  OnrampResponse,
  OfframpResponse,
  CreateOrderRequest,
  SplitRequest,
  MergeRequest,
  OnrampRequest,
  OfframpRequest,
  ApiError,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL as string || 'http://localhost:3000';

/* ── Internal Helpers ── */

async function getAuthToken(): Promise<string | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  requiresAuth: boolean = false
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    const token = await getAuthToken();
    if (!token) {
      throw { message: 'Not authenticated', status: 401 } as ApiError;
    }
    headers['Authorization'] = token;
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (body && method !== 'GET') {
    config.body = JSON.stringify(body);
  }

  const url = `${API_BASE}${path}`;
  const response = await fetch(url, config);

  if (!response.ok) {
    let errorMessage = 'An unexpected error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // response body wasn't JSON
    }
    throw { message: errorMessage, status: response.status } as ApiError;
  }

  // Some endpoints don't return a body (204, or split bug)
  const text = await response.text();
  if (!text) return {} as T;

  return JSON.parse(text) as T;
}

/* ── Public API ── */

/** GET /markets — List all markets (public) */
export async function fetchMarkets(): Promise<MarketsResponse> {
  return request<MarketsResponse>('GET', '/markets');
}

/** GET /market?marketId=... — Get single market (public) */
export async function fetchMarket(marketId: string): Promise<MarketResponse> {
  return request<MarketResponse>('GET', `/market?marketId=${encodeURIComponent(marketId)}`);
}

/** POST /order — Place a buy/sell order (auth required) */
export async function placeOrder(data: CreateOrderRequest): Promise<MessageResponse> {
  return request<MessageResponse>('POST', '/order', data, true);
}

/** POST /split — Split USD into Yes+No shares (auth required) */
export async function splitPosition(data: SplitRequest): Promise<MessageResponse> {
  return request<MessageResponse>('POST', '/split', data, true);
}

/** POST /merge — Merge Yes+No shares into USD (auth required) */
export async function mergePosition(data: MergeRequest): Promise<MessageResponse> {
  return request<MessageResponse>('POST', '/merge', data, true);
}

/** GET /balance — Get user's USD balance (auth required) */
export async function fetchBalance(): Promise<BalanceResponse> {
  return request<BalanceResponse>('GET', '/balance', undefined, true);
}

/** GET /positions — Get user's positions (auth required) */
export async function fetchPositions(): Promise<PositionsResponse> {
  return request<PositionsResponse>('GET', '/positions', undefined, true);
}

/** POST /history — Get user's order history (auth required) */
export async function fetchHistory(): Promise<HistoryResponse> {
  return request<HistoryResponse>('POST', '/history', undefined, true);
}

/** POST /onramp — Deposit funds (auth required) */
export async function onramp(data: OnrampRequest): Promise<OnrampResponse> {
  return request<OnrampResponse>('POST', '/onramp', data, true);
}

/** POST /offramp — Withdraw funds (auth required) */
export async function offramp(data: OfframpRequest): Promise<OfframpResponse> {
  return request<OfframpResponse>('POST', '/offramp', data, true);
}
