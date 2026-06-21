/* ──────────────────────────────────────────────
   Kairo — Auth Context
   Manages Supabase Web3/Solana wallet authentication
   and user state throughout the app
   ────────────────────────────────────────────── */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { fetchBalance } from "../lib/api";

interface AuthUser {
  address: string;
  supabaseId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  balance: number; // in cents
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  const extractUser = useCallback(
    (
      supabaseUser: {
        id: string;
        user_metadata?: Record<string, unknown>;
      } | null,
    ): AuthUser | null => {
      if (!supabaseUser) return null;
      const claims = supabaseUser.user_metadata?.custom_claims as
        | Record<string, string>
        | undefined;
      const address = claims?.address;
      if (!address) return null;
      return { address, supabaseId: supabaseUser.id };
    },
    [],
  );

  const refreshBalance = useCallback(async () => {
    try {
      const { balance: bal } = await fetchBalance();
      setBalance(bal);
    } catch {
      // User might not be provisioned yet
    }
  }, []);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user && mounted) {
          const authUser = extractUser(data.session.user);
          setUser(authUser);
          if (authUser) {
            await refreshBalance();
          }
        }
      } catch {
        // Session expired or invalid
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    init();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const authUser = extractUser(session?.user ?? null);
      setUser(authUser);
      if (authUser) {
        // Small delay to ensure backend processes the new user
        setTimeout(() => refreshBalance(), 500);
      } else {
        setBalance(0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [extractUser, refreshBalance]);

  const signIn = useCallback(async () => {
    await supabase.auth.signInWithWeb3({
      chain: "solana",
      statement: "I accept the Terms of Service at Kairo",
    } as Parameters<typeof supabase.auth.signInWithWeb3>[0]);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBalance(0);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        balance,
        isAuthenticated: user !== null,
        isLoading,
        signIn,
        signOut,
        refreshBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
