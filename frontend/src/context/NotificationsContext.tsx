import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listActiveNotifications } from "../api/notifications";
import type { NotificationListItem } from "../api/types";
import { useAuth } from "./AuthContext";
import { useBusiness } from "./BusinessContext";
import { useFeatureFlags } from "./FeatureFlagsContext";

interface NotificationsContextValue {
  badgeCount: number;
  activeNotifications: NotificationListItem[];
  moduleAlerts: Set<string>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { isEnabled } = useFeatureFlags();
  const [activeNotifications, setActiveNotifications] = useState<NotificationListItem[]>([]);

  async function refresh() {
    if (!user || !activeBusiness || !isEnabled("notifications")) {
      setActiveNotifications([]);
      return;
    }
    try {
      setActiveNotifications(await listActiveNotifications());
    } catch {
      // non-critical; leave state as-is
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeBusiness?.id]);

  const moduleAlerts = useMemo(() => {
    const set = new Set<string>();
    for (const n of activeNotifications) {
      for (const m of n.visibility_modules) set.add(m);
    }
    return set;
  }, [activeNotifications]);

  const value = useMemo(
    () => ({ badgeCount: activeNotifications.length, activeNotifications, moduleAlerts, refresh }),
    [activeNotifications, moduleAlerts],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
