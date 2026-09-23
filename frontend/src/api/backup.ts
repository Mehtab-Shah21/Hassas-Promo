import { apiClient } from "./client";

// "legacy" is a plain .db copy from an older version (database only, no
// uploaded files); "unknown" is a file that couldn't be read as a backup.
export type BackupKind = "manual" | "auto" | "pre-restore" | "legacy" | "unknown";

export interface BackupFileInfo {
  filename: string;
  size_bytes: number;
  created_at: string;
  kind: BackupKind;
  includes_uploads: boolean;
  upload_files: number;
  valid: boolean;
}

export interface BackupSettings {
  supported: boolean;
  backup_folder: string;
  using_default_folder: boolean;
  default_folder: string;
  extra_folders: string[];
  auto_enabled: boolean;
  auto_interval_hours: number;
  keep_auto_count: number;
  last_auto_backup_at: string | null;
  last_backup_at: string | null;
  last_backup_status: "ok" | "failed" | null;
  last_backup_error: string | null;
  next_auto_backup_due: string | null;
}

export type BackupSettingsPatch = Partial<Pick<BackupSettings, "auto_enabled" | "auto_interval_hours" | "keep_auto_count">> & {
  /** An empty string switches back to the default folder. */
  backup_folder?: string;
  /** Full replacement list each time (not a merge) — an empty array clears every extra folder. */
  extra_folders?: string[];
};

export interface RestoreResult {
  ok: boolean;
  safety_backup: string;
  restored_uploads: boolean;
  message: string;
}

// Backups include every uploaded file, and a restore migrates the database, so
// these can take a while on a big install — don't let the request time out.
const LONG_REQUEST_MS = 10 * 60 * 1000;

export async function getBackupSettings(): Promise<BackupSettings> {
  const res = await apiClient.get<BackupSettings>("/api/backup/settings");
  return res.data;
}

export async function updateBackupSettings(patch: BackupSettingsPatch): Promise<BackupSettings> {
  const res = await apiClient.patch<BackupSettings>("/api/backup/settings", patch);
  return res.data;
}

export async function runBackup(): Promise<BackupFileInfo> {
  const res = await apiClient.post<BackupFileInfo>("/api/backup/run", undefined, { timeout: LONG_REQUEST_MS });
  return res.data;
}

export async function listBackups(): Promise<BackupFileInfo[]> {
  const res = await apiClient.get<BackupFileInfo[]>("/api/backup/list");
  return res.data;
}

export async function downloadBackup(filename: string): Promise<Blob> {
  const res = await apiClient.get(`/api/backup/download/${encodeURIComponent(filename)}`, {
    responseType: "blob",
    timeout: LONG_REQUEST_MS,
  });
  return res.data as Blob;
}

export async function restoreBackup(filename: string): Promise<RestoreResult> {
  const res = await apiClient.post<RestoreResult>(
    "/api/backup/restore",
    { filename, confirm: true },
    { timeout: LONG_REQUEST_MS },
  );
  return res.data;
}

export async function restoreBackupFromFile(file: File): Promise<RestoreResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("confirm", "true");
  const res = await apiClient.post<RestoreResult>("/api/backup/restore-upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: LONG_REQUEST_MS,
  });
  return res.data;
}
