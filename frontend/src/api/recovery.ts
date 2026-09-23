import axios from "axios";

import { apiClient, getServerUrl } from "./client";

/**
 * Superadmin account recovery. Everyone else who forgets a password has
 * somebody above them who can reset it; a superadmin doesn't, so they hold a
 * recovery code instead — generated while signed in, used from the login
 * screen if they're ever locked out.
 */

export async function getRecoveryStatus(): Promise<{ has_recovery_code: boolean }> {
  const res = await apiClient.get<{ has_recovery_code: boolean }>("/api/auth/recovery-code");
  return res.data;
}

/** Returns the code in the clear — this is the only time it is ever shown. */
export async function generateRecoveryCode(): Promise<{ recovery_code: string }> {
  const res = await apiClient.post<{ recovery_code: string }>("/api/auth/recovery-code");
  return res.data;
}

/**
 * Used from the login screen, so it deliberately bypasses `apiClient`: that
 * instance attaches the stored auth token, and there isn't one here — the
 * whole point is that nobody is signed in.
 */
export async function recoverAccount(
  recoveryCode: string,
  newPassword: string,
): Promise<{ username: string; message: string }> {
  const base = getServerUrl();
  const res = await axios.post<{ username: string; message: string }>(
    `${base}/api/auth/recover`,
    { recovery_code: recoveryCode, new_password: newPassword },
  );
  return res.data;
}
