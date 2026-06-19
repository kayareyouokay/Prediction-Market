/* ──────────────────────────────────────────────
   Kairo — Utility Functions
   ────────────────────────────────────────────── */

import type { Market, Orderbook, Position, PositionType, OrderType } from './types';

/**
 * Format integer cents to display USD string.
 * e.g. 1550 → "$15.50", 0 → "$0.00"
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Format a price level (0–100) to display as USD cents.
 * e.g. 65 → "$0.65"
 */
export function formatPrice(price: number): string {
  return `$${(price / 100).toFixed(2)}`;
}

/**
 * Format a price level (0–100) to a percentage.
 * e.g. 65 → "65%"
 */
export function formatPercent(price: number): string {
  return `${Math.round(price)}%`;
}

/**
 * Format a price level (0–100) as a decimal probability.
 * e.g. 65 → "0.65"
 */
export function formatProbability(price: number): string {
  return (price / 100).toFixed(2);
}

/**
 * Truncate a wallet address for display.
 * e.g. "0x1234567890abcdef1234567890abcdef12345678" → "0x1234...5678"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format a quantity with commas.
 * e.g. 1234567 → "1,234,567"
 */
export function formatQty(qty: number): string {
  return new Intl.NumberFormat('en-US').format(qty);
}

/**
 * Merge class names, filtering out falsy values.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Get the best Yes price from a market's orderbooks.
 * The "Yes price" is derived from the lowest ask on the Yes orderbook,
 * or 100 minus the lowest ask on the No orderbook.
 * Returns a value 0–100. Defaults to 50 if orderbook is empty.
 */
export function getYesPrice(market: Market): number {
  const yesBook = market.yesOrderbook as Orderbook;
  const noBook = market.noOrderbook as Orderbook;

  // Best yes ask (lowest price someone is willing to sell Yes)
  const yesPrices = Object.keys(yesBook)
    .map(Number)
    .filter(p => yesBook[String(p)]!.availableQty > 0)
    .sort((a, b) => a - b);

  // Best no ask → implies yes bid at 100 - price
  const noPrices = Object.keys(noBook)
    .map(Number)
    .filter(p => noBook[String(p)]!.availableQty > 0)
    .sort((a, b) => a - b);

  if (yesPrices.length > 0 && noPrices.length > 0) {
    // Midpoint between best yes ask and implied yes bid from no side
    const bestYesAsk = yesPrices[0]!;
    const impliedYesBid = 100 - noPrices[0]!;
    return Math.round((bestYesAsk + impliedYesBid) / 2);
  }

  if (yesPrices.length > 0) return yesPrices[0]!;
  if (noPrices.length > 0) return 100 - noPrices[0]!;

  return 50; // Default midpoint
}

/**
 * Check if a market is resolved.
 */
export function isResolved(market: Market): boolean {
  return market.resolution !== null;
}

/**
 * Get the market status label.
 */
export function getMarketStatus(market: Market): 'active' | 'resolved-yes' | 'resolved-no' {
  if (market.resolution === 'Yes') return 'resolved-yes';
  if (market.resolution === 'No') return 'resolved-no';
  return 'active';
}

/**
 * Get the order type display label.
 */
export function getOrderTypeLabel(type: OrderType): string {
  const labels: Record<OrderType, string> = {
    Buy: 'Buy',
    Sell: 'Sell',
    Split: 'Split',
    Merge: 'Merge',
  };
  return labels[type];
}

/**
 * Get the position type display color class.
 */
export function getPositionColor(type: PositionType): string {
  return type === 'Yes' ? 'yes' : 'no';
}

/**
 * Parse orderbook into sorted rows for display.
 */
export function parseOrderbookRows(orderbook: Orderbook, side: 'bid' | 'ask'): Array<{ price: number; qty: number; total: number }> {
  const entries = Object.entries(orderbook)
    .map(([price, level]) => ({
      price: Number(price),
      qty: level.availableQty,
    }))
    .filter(e => e.qty > 0);

  // Sort: bids descending (highest first), asks ascending (lowest first)
  if (side === 'bid') {
    entries.sort((a, b) => b.price - a.price);
  } else {
    entries.sort((a, b) => a.price - b.price);
  }

  let cumulative = 0;
  return entries.map(e => {
    cumulative += e.qty;
    return { ...e, total: cumulative };
  });
}

/**
 * Calculate total available quantity in an orderbook.
 */
export function getTotalOrderbookQty(orderbook: Orderbook): number {
  return Object.values(orderbook).reduce((sum, level) => sum + level.availableQty, 0);
}

/**
 * Estimate the current value of a position based on market prices.
 */
export function estimatePositionValue(position: Position, market: Market): number {
  const yesPrice = getYesPrice(market);
  const price = position.type === 'Yes' ? yesPrice : 100 - yesPrice;
  return position.qty * price;
}

/**
 * Generate a deterministic gradient from a wallet address for avatar.
 */
export function addressToGradient(address: string): string {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }

  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 60%), hsl(${h2}, 70%, 50%))`;
}

/**
 * Delay utility for artificial loading states.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
