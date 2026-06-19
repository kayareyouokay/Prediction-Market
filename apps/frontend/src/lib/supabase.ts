/* ──────────────────────────────────────────────
   Kairo — Supabase Client (Singleton)
   ────────────────────────────────────────────── */

import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Auth is optional for public market discovery. Keeping creation lazy means the
 * product remains usable in an unconfigured local environment.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseUrl || !supabaseKey) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(supabaseUrl, supabaseKey));
  return clientPromise;
}

export function isAuthConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}
