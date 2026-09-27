"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase, supabaseConfigured } from "../../lib/supabase";
import type { ProfileRow, ScanRow } from "../../lib/database.types";

type AccountState = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: ProfileRow | null;
  scans: ScanRow[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<AccountState | null>(null);

export function Averis2AccountProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(Boolean(supabaseConfigured));
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);

  const loadAccount = useCallback(async (nextUser: User | null) => {
    if (!supabase || !nextUser) {
      setProfile(null);
      setScans([]);
      return;
    }

    const [{ data: profileData, error: profileError }, { data: scanData, error: scanError }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", nextUser.id).single(),
      supabase.from("scans").select("*").eq("user_id", nextUser.id).order("created_at", { ascending: false }).limit(20),
    ]);

    if (profileError) {
      console.error("Unable to load Averis profile", profileError.message);
      setProfile(null);
    } else {
      setProfile(profileData);
    }

    if (scanError) {
      console.error("Unable to load Averis scan history", scanError.message);
      setScans([]);
    } else {
      setScans(scanData ?? []);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const nextUser = data.session?.user ?? null;
    setUser(nextUser);
    await loadAccount(nextUser);
  }, [loadAccount]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;

    async function bootstrap() {
      const { data } = await supabase!.auth.getSession();
      if (!active) return;
      const nextUser = data.session?.user ?? null;
      setUser(nextUser);
      await loadAccount(nextUser);
      if (active) setLoading(false);
    }

    void bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      setLoading(true);
      void loadAccount(nextUser).finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const value = useMemo<AccountState>(
    () => ({
      configured: supabaseConfigured,
      loading,
      user,
      profile,
      scans,
      refresh,
      signOut,
    }),
    [loading, profile, refresh, scans, signOut, user],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAveris2Account() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAveris2Account must be used inside Averis2AccountProvider");
  return value;
}
