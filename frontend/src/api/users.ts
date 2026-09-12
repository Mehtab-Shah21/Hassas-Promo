import { apiClient } from "./client";
import type { AppUser } from "./types";

export async function listUsers(): Promise<AppUser[]> {
  const res = await apiClient.get<AppUser[]>("/api/users");
  return res.data;
}

export type UserPayload = Partial<Omit<AppUser, "id" | "is_active">> & { password?: string };

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
