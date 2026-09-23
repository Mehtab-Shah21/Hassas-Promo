import { apiClient } from "./client";
import type { AppUser } from "./types";

export async function listUsers(): Promise<AppUser[]> {
  const res = await apiClient.get<AppUser[]>("/api/users");
  return res.data;
}

// business_id is intentionally excluded — the backend always resolves it
// from the currently active business (X-Business-Id), never from the
// payload. employee_id only ever LINKS to a staff record that already
// exists; staff are added in Employees, not here.
export type UserPayload = Partial<Omit<AppUser, "id" | "is_active" | "business_id" | "is_system_owner">> & {
  password?: string;
};

export async function createUser(payload: UserPayload): Promise<AppUser> {
  const res = await apiClient.post<AppUser>("/api/users", payload);
  return res.data;
}

export async function updateUser(id: number, payload: UserPayload): Promise<AppUser> {
  const res = await apiClient.patch<AppUser>(`/api/users/${id}`, payload);
  return res.data;
}

export async function deactivateUser(id: number): Promise<void> {
  await apiClient.delete(`/api/users/${id}`);
}

// For someone else who has forgotten their password — no current password
// needed. Your own password goes through changeOwnPassword instead.
export async function resetUserPassword(id: number, newPassword: string): Promise<void> {
  await apiClient.post(`/api/users/${id}/reset-password`, { new_password: newPassword });
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post("/api/auth/change-password", { current_password: currentPassword, new_password: newPassword });
}
