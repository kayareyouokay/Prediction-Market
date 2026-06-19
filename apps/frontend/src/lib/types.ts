/* ──────────────────────────────────────────────
   Kairo — TypeScript Type Definitions
   Derived directly from backend Prisma schema
   and API endpoint contracts
   ────────────────────────────────────────────── */

/* ── Enums ── */

export type PositionType = 'Yes' | 'No';
export type OrderType = 'Buy' | 'Sell' | 'Split' | 'Merge';
export type OrderSide = 'yes' | 'no';
export type TradeType = 'buy' | 'sell';

/* ── Database Entities ── */

export interface User {
  id: string;
  address: string;
  usdBalance: number; // in cents
}

export interface Market {
  id: string;
  title: string;
  description: string;
  resolutionDescription: string;
  yesOrderbook: Orderbook;
  noOrderbook: Orderbook;
  totalQty: number;
  resolution: PositionType | null;
}

export interface Position {
  id: string;
  userId: string;
  marketId: string;
  type: PositionType;
  qty: number;
  market?: Market;
  user?: User;
}

export interface OrderHistory {
  id: string;
  orderType: OrderType;
  qty: number;
  price: number; // in cents (0–100)
  userId: string;
  marketId: string;
  market?: Market;
  user?: User;
}

/* ── Orderbook Types ── */

export interface OrderbookEntry {
  userId: string;
  qty: number;
  filledQty: number;
  originalOrderId: string;
  reverseOrder: boolean;
}

export interface OrderbookLevel {
  availableQty: number;
  orders: OrderbookEntry[];
}

export type Orderbook = Record<string, OrderbookLevel>;

/* ── API Request Types ── */

export interface CreateOrderRequest {
  marketId: string;
  side: OrderSide;
  type: TradeType;
  price: number;  // 1–99 (cents)
  qty: number;
}

export interface SplitRequest {
  marketId: string;
  amount: number;
}

export interface MergeRequest {
  marketId: string;
  amount: number;
}

export interface OnrampRequest {
  amount: number; // in USD (e.g. 100.50)
}

export interface OfframpRequest {
  amount: number; // in USD (e.g. 100.50)
}

/* ── API Response Types ── */

export interface MarketsResponse {
  markets: Market[];
}

export interface MarketResponse {
  market: Market | null;
}

export interface BalanceResponse {
  balance: number;
}

export interface PositionsResponse {
  positions: Position[];
}

export interface HistoryResponse {
  history: OrderHistory[];
}

export interface MessageResponse {
  message: string;
}

export interface OnrampResponse {
  message: string;
  amount: number;
}

export interface OfframpResponse {
  message: string;
  amount: number;
}

/* ── UI State Types ── */

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

export interface ApiError {
  message: string;
  status?: number;
}

/* ── Derived / Computed Types ── */

export interface MarketWithPrices extends Market {
  yesPrice: number;
  noPrice: number;
  yesPercent: number;
  noPercent: number;
}

export interface PositionWithMarket extends Position {
  market: Market;
  currentValue: number; // estimated value in cents based on current prices
}

export interface OrderbookRow {
  price: number;
  qty: number;
  total: number; // cumulative qty
  side: 'bid' | 'ask';
}

export interface PortfolioSummary {
  totalValue: number;      // balance + estimated position value in cents
  totalPositions: number;
  activeMarkets: number;
  balance: number;         // usdBalance in cents
}
