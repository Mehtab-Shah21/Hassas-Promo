import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { listActiveNotifications } from "../api/notifications";
import { listSalaryAlerts } from "../api/salaryDeductions";
import type { NotificationListItem, SalaryAlert } from "../api/types";
import { isAdminOrAbove } from "../utils/roles";
import { useAuth } from "./AuthContext";
import { useBusiness } from "./BusinessContext";
import { useFeatureFlags } from "./FeatureFlagsContext";

interface NotificationsContextValue {
  /** Customer-service reminders that have come due (what the Notifications page manages). */
  badgeCount: number;
  activeNotifications: NotificationListItem[];
  /** Salaries that have reached their pay date and are unpaid. Admins and superadmins only. */
  salaryAlerts: SalaryAlert[];
  /** Everything the bell should show: reminders + salary alerts. */
  bellCount: number;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

// A pay date can arrive while the app sits open overnight, so the bell checks
// again now and then instead of only when it loads.
const REFRESH_EVERY_MS = 5 * 60 * 1000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeBusiness } = useBusiness();
  const { isEnabled } = useFeatureFlags();
  const [activeNotifications, setActiveNotifications] = useState<NotificationListItem[]>([]);
  const [salaryAlerts, setSalaryAlerts] = useState<SalaryAlert[]>([]);

  async function refresh() {
    if (!user || !activeBusiness) {
      setActiveNotifications([]);
      setSalaryAlerts([]);
      return;
    }

    if (isEnabled("notifications")) {
      try {
        setActiveNotifications(await listActiveNotifications());
      } catch {
        // non-critical; leave state as-is
      }
    } else {
      setActiveNotifications([]);
    }

    // Salary pay-date alerts: the Employees module's, for admins and above.
    if (isEnabled("attendance") && isAdminOrAbove(user.role)) {
      try {
        setSalaryAlerts(await listSalaryAlerts());
      } catch {
        // non-critical; leave state as-is
      }
    } else {
      setSalaryAlerts([]);
    }
  }

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_EVERY_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeBusiness?.id]);

  const value = useMemo(
    () => ({
      badgeCount: activeNotifications.length,
      activeNotifications,
      salaryAlerts,
      bellCount: activeNotifications.length + salaryAlerts.length,
      refresh,
    }),
    [activeNotifications, salaryAlerts],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
