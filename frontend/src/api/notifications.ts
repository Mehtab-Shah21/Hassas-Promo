import { apiClient } from "./client";
import type { NotificationListItem, ReminderUnit } from "./types";

export async function listNotifications(unacknowledgedOnly = false): Promise<NotificationListItem[]> {
  const res = await apiClient.get<NotificationListItem[]>("/api/notifications", {
    params: { unacknowledged_only: unacknowledgedOnly },
  });
  return res.data;
}

export async function listActiveNotifications(): Promise<NotificationListItem[]> {
  const res = await apiClient.get<NotificationListItem[]>("/api/notifications/active");
  return res.data;
}

export interface ReminderInput {
  offset_value: number;
  offset_unit: ReminderUnit;
}

export async function createNotification(payload: {
  customer_id: number;
  service_id: number;
  note?: string | null;
  target_date: string;
  visibility_modules: string[];
  reminders: ReminderInput[];
}): Promise<void> {
  await apiClient.post("/api/notifications", payload);
}

export async function acknowledgeNotification(id: number): Promise<void> {
  await apiClient.post(`/api/notifications/${id}/acknowledge`);
}

export async function snoozeNotification(id: number, days = 3): Promise<void> {
  await apiClient.post(`/api/notifications/${id}/snooze`, { days });
}

export async function deleteNotification(id: number): Promise<void> {
  await apiClient.delete(`/api/notifications/${id}`);
}
