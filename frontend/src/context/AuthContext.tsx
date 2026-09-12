import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../api/types";

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  locked: boolean;
  login: (username: string, password: string) => Promise<void>;
  loginWithPin: (username: string, pin: string) => Promise<void>;
  logout: () => void;
  unlock: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const fetchMe = useCallback(async () => {
    const res = await apiClient.get<CurrentUser>("/api/auth/me");
    setUser(res.data);
  }, []);

  const refreshUser = useCallback(async () => {
    await fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .catch(() => {
        localStorage.removeItem("access_token");
      })
      .finally(() => setLoading(false));
  }, [fetchMe]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await apiClient.post<{ access_token: string }>("/api/auth/login", { username, password });
      localStorage.setItem("access_token", res.data.access_token);
      await fetchMe();
      setLocked(false);
    },
    [fetchMe],
  );

  const loginWithPin = useCallback(
    async (username: string, pin: string) => {
      const res = await apiClient.post<{ access_token: string }>("/api/auth/login-pin", { username, pin });
      localStorage.setItem("access_token", res.data.access_token);
      await fetchMe();
      setLocked(false);
    },
    [fetchMe],
  );

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    setUser(null);
    setLocked(false);
  }, []);

  const unlock = useCallback(() => setLocked(false), []);

  // Session auto-lock after inactivity (per-user configurable, falls back to 15 min)
  useEffect(() => {
    if (!user) return;
    const timeoutMs = (user.auto_lock_minutes || 15) * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setLocked(true), timeoutMs);
    };
    const events = ["mousemove", "keydown", "click", "scroll"];
    events.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();
    return () => {
      clearTimeout(timer);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [user, user?.auto_lock_minutes]);

  const value = useMemo(
    () => ({ user, loading, locked, login, loginWithPin, logout, unlock, refreshUser }),
    [user, loading, locked, login, loginWithPin, logout, unlock, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
