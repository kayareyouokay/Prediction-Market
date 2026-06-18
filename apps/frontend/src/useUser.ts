import { useEffect, useState } from "react";
import { useSupabase } from "./useSupabase";

export function useUser() {
  const supabase = useSupabase();
  const [claims, setClaims] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const loadClaims = async () => {
      const { data } = await supabase.auth.getClaims();
      setClaims(data?.claims ?? null);
    };

    loadClaims();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(loadClaims);

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return { claims, setClaims };
}