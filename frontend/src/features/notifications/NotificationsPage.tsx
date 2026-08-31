import { useEffect, useState } from "react";
import {
  acknowledgeNotification,
  deleteNotification,
  listNotificationTypes,
  listNotifications,
  snoozeNotification,
} from "../../api/notifications";
import type { NotificationListItem, NotificationType } from "../../api/types";
import { useBusiness } from "../../context/BusinessContext";
import { useNotifications } from "../../context/NotificationsContext";
import NotificationFormModal from "./NotificationFormModal";

function urgencyClass(n: NotificationListItem): string {
  if (n.acknowledged_at) return "border-l-slate-200";
  if (n.days_remaining < 0) return "border-l-red-500";
  if (n.triggered) return "border-l-amber-500";
  return "border-l-slate-200";
}

export default function NotificationsPage() {
  const { activeBusiness } = useBusiness();
  const { refresh: refreshBadge } = useNotifications();
  const [items, setItems] = useState<NotificationListItem[]>([]);
  const [types, setTypes] = useState<NotificationType[]>([]);
  const [showOnlyPending, setShowOnlyPending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await listNotifications(showOnlyPending));
    } finally {
      setLoading(false);
    }
  }

  async function loadTypes() {
    setTypes(await listNotificationTypes());
  }

  useEffect(() => {
    if (!activeBusiness) return;
    load();
    loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id, showOnlyPending]);

  async function handleAcknowledge(id: number) {
    await acknowledgeNotification(id);
    load();
    refreshBadge();
  }
  async function handleSnooze(id: number) {
    await snoozeNotification(id, 3);
    load();
    refreshBadge();
  }
  async function handleDelete(id: number) {
    if (!confirm("Delete this notification?")) return;
    await deleteNotification(id);
    load();
    refreshBadge();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Notifications</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          + New notification
        </button>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showOnlyPending} onChange={(e) => setShowOnlyPending(e.target.checked)} />
        Show only unacknowledged
      </label>

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Nothing here. All caught up.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.id} className={`flex items-center justify-between rounded-lg border border-l-4 border-line bg-surface p-4 ${urgencyClass(n)}`}>
              <div>
                <p className="font-medium text-ink">
                  {n.customer_name} <span className="font-normal text-muted">· {n.type_name}</span>
                </p>
                {n.note && <p className="text-sm text-muted">{n.note}</p>}
                <p className="text-xs text-muted">
                  Target: {n.target_date} ·{" "}
                  {n.days_remaining < 0 ? `${-n.days_remaining} days overdue` : `${n.days_remaining} days remaining`}
                  {n.acknowledged_at && " · acknowledged"}
                  {n.snoozed_until && ` · snoozed until ${n.snoozed_until}`}
                </p>
              </div>
              {!n.acknowledged_at && (
                <div className="flex gap-2 text-sm">
                  <button onClick={() => handleSnooze(n.id)} className="rounded-md border border-line px-3 py-1 hover:bg-wash-1">
                    Snooze 3d
                  </button>
                  <button onClick={() => handleAcknowledge(n.id)} className="rounded-md bg-accent px-3 py-1 text-white hover:opacity-90 transition-opacity">
                    Acknowledge
                  </button>
                  <button onClick={() => handleDelete(n.id)} className="text-danger hover:underline">
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NotificationFormModal
          types={types}
          onTypesChanged={loadTypes}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
            refreshBadge();
          }}
        />
      )}
    </div>
  );
}
