import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";
import type { Business } from "../api/types";
import { useAuth } from "./AuthContext";
import { isSuperadmin } from "../utils/roles";

interface BusinessContextValue {
  businesses: Business[];
  activeBusiness: Business | null;
  setActiveBusinessId: (id: number) => void;
  loading: boolean;
  refreshBusinesses: () => Promise<void>;
}

const BusinessContext = createContext<BusinessContextValue | undefined>(undefined);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem("active_business_id");
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  const fetchBusinesses = useCallback(async (currentUserBusinessId?: number | null, superadmin?: boolean) => {
    // GET /api/businesses is itself company-scoped server-side: a
    // non-superadmin only ever gets their own business back in this list,
    // so there's nothing to pick between for them.
    const res = await apiClient.get<Business[]>("/api/businesses");
    setBusinesses(res.data);
    setActiveBusinessIdState((current) => {
      if (!superadmin) {
        // Never trust a stale localStorage selection (e.g. left over from
        // a previous superadmin session on this machine) — a non-superadmin
        // is always pinned to their own assigned company.
        return currentUserBusinessId ?? (res.data[0]?.id ?? null);
      }
      if (current && res.data.some((b) => b.id === current)) return current;
      return res.data[0] ? res.data[0].id : null;
    });
  }, []);

  // Closes over the current user so every caller (the initial load below,
  // and every Settings page's post-save refreshBusinesses()) re-resolves
  // the same non-superadmin pin instead of a superadmin's edit accidentally
  // resetting their own switcher selection back to the first business.
  const refreshBusinesses = useCallback(async () => {
    await fetchBusinesses(user?.business_id, isSuperadmin(user?.role));
  }, [fetchBusinesses, user]);

  useEffect(() => {
    if (!user) {
      setBusinesses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshBusinesses().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (activeBusinessId) {
      localStorage.setItem("active_business_id", String(activeBusinessId));
    }
  }, [activeBusinessId]);

  const setActiveBusinessId = useCallback(
    (id: number) => {
      // Defensive: the switcher UI is hidden for non-superadmins, but even
      // if something called this directly, a non-superadmin can never
      // actually move off their own assigned company.
      if (user && !isSuperadmin(user.role)) return;
      setActiveBusinessIdState(id);
    },
    [user],
  );

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === activeBusinessId) ?? null,
    [businesses, activeBusinessId],
  );

  const value = useMemo(
    () => ({ businesses, activeBusiness, setActiveBusinessId, loading, refreshBusinesses }),
    [businesses, activeBusiness, setActiveBusinessId, loading, refreshBusinesses],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}
