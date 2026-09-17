import { useEffect, useState, type FormEvent } from "react";
import { Clock, Download, FolderOpen, RotateCcw, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import {
  downloadBackup,
  getBackupSettings,
  listBackups,
  restoreBackup,
  restoreBackupFromFile,
  runBackup,
  updateBackupSettings,
  type BackupFileInfo,
  type BackupSettings,
  type RestoreResult,
} from "../../../api/backup";
import Modal from "../../../components/Modal";
import { Field, SaveButton, Select, TextInput, Toggle } from "../../../components/form/Field";
import { useAuth } from "../../../context/AuthContext";
import { downloadBlob } from "../../../platform/download";
import { getErrorMessage } from "../../../utils/errors";

const INTERVALS = [
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Once a day" },
  { hours: 48, label: "Every 2 days" },
  { hours: 168, label: "Once a week" },
];

const KIND_BADGES: Record<string, { label: string; style: string }> = {
  auto: { label: "Automatic", style: "bg-link/20 text-link" },
  manual: { label: "Manual", style: "bg-accent-green/20 text-accent-green" },
  "pre-restore": { label: "Before restore", style: "bg-orange-50/20 text-orange-50" },
  legacy: { label: "Older format", style: "bg-wash-2 text-muted" },
  unknown: { label: "Unreadable", style: "bg-danger/20 text-danger" },
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatWhen(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "Never";
}

type RestoreTarget = { source: "stored"; backup: BackupFileInfo } | { source: "file"; file: File };

export default function BackupPage() {
  const { logout } = useAuth();
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);

  const [autoEnabled, setAutoEnabled] = useState(true);
  const [intervalHours, setIntervalHours] = useState(24);
  const [keepCount, setKeepCount] = useState("14");
  const [folder, setFolder] = useState("");

  const [savingAuto, setSavingAuto] = useState(false);
  const [savingFolder, setSavingFolder] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);

  async function load() {
    const s = await getBackupSettings();
    setSettings(s);
    setAutoEnabled(s.auto_enabled);
    setIntervalHours(s.auto_interval_hours);
    setKeepCount(String(s.keep_auto_count));
    setFolder(s.using_default_folder ? "" : s.backup_folder);
    setBackups(await listBackups());
  }

  useEffect(() => {
    load().catch((err) => setError(getErrorMessage(err, "Could not load backup settings.")));
  }, []);

  function show(ok: string | null, err: string | null) {
    setMessage(ok);
    setError(err);
  }

  async function handleSaveAuto(e: FormEvent) {
    e.preventDefault();
    setSavingAuto(true);
    try {
      await updateBackupSettings({
        auto_enabled: autoEnabled,
        auto_interval_hours: intervalHours,
        keep_auto_count: Math.max(1, Number(keepCount) || 14),
      });
      show("Automatic backup settings saved.", null);
      await load();
    } catch (err: unknown) {
      show(null, getErrorMessage(err, "Could not save automatic backup settings."));
    } finally {
      setSavingAuto(false);
    }
  }

  async function handleSaveFolder(e: FormEvent) {
    e.preventDefault();
    setSavingFolder(true);
    try {
      await updateBackupSettings({ backup_folder: folder.trim() });
      show(folder.trim() ? "Backup folder saved." : "Using the default backup folder.", null);
      await load();
    } catch (err: unknown) {
      show(null, getErrorMessage(err, "Could not use that folder."));
    } finally {
      setSavingFolder(false);
    }
  }

  async function handleBackupNow() {
    setRunning(true);
    try {
      const info = await runBackup();
      show(`Backup created: ${info.filename}`, null);
      await load();
    } catch (err: unknown) {
      show(null, getErrorMessage(err, "Backup failed."));
      await load().catch(() => undefined);
    } finally {
      setRunning(false);
    }
  }

  async function handleDownload(b: BackupFileInfo) {
    try {
      downloadBlob(await downloadBackup(b.filename), b.filename);
    } catch (err: unknown) {
      show(null, getErrorMessage(err, "Could not download that backup."));
    }
  }

  if (settings && !settings.supported) {
    return (
      <div className="max-w-2xl">
        <h2 className="text-lg font-semibold text-ink">Backup & Restore</h2>
        <p className="mt-2 text-sm text-muted">
          This installation uses an external database server. Back it up with that server's own tools (for PostgreSQL,
          pg_dump and pg_restore).
        </p>
      </div>
    );
  }

  const lastBackupMs = settings?.last_backup_at ? new Date(settings.last_backup_at).getTime() : null;
  const overdue =
    !!settings?.auto_enabled && lastBackupMs !== null && Date.now() - lastBackupMs > settings.auto_interval_hours * 2 * 3600 * 1000;
  const failed = settings?.last_backup_status === "failed";
  const neverBackedUp = !!settings && !settings.last_backup_at;
  const healthy = !!settings && !failed && !overdue && !neverBackedUp;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Backup & Restore</h2>
        <p className="text-sm text-muted">
          Each backup is a single file with all data for every company, including uploaded images and PDFs.
        </p>
      </div>

      {settings && (
        <div
          className={`flex gap-3 rounded-lg border p-4 ${
            healthy ? "border-accent-green/40 bg-accent-green/10" : "border-orange-50/40 bg-orange-50/10"
          }`}
        >
          {healthy ? (
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-accent-green" />
          ) : (
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-orange-50" />
          )}
          <div className="space-y-1 text-sm">
            <p className="font-medium text-ink">
              {failed
                ? "The last backup failed"
                : neverBackedUp
                  ? "No backup has been made yet"
                  : overdue
                    ? "Backups haven't run recently"
                    : "Your data is backed up"}
            </p>
            {failed && settings.last_backup_error && <p className="text-danger">{settings.last_backup_error}</p>}
            <p className="text-muted">
              Last successful backup: <span className="text-ink">{formatWhen(settings.last_backup_at)}</span>
            </p>
            <p className="text-muted">
              {settings.auto_enabled ? (
                <>
                  Next automatic backup:{" "}
                  <span className="text-ink">
                    {settings.next_auto_backup_due
                      ? new Date(settings.next_auto_backup_due) < new Date()
                        ? "due now — runs within a few minutes"
                        : formatWhen(settings.next_auto_backup_due)
                      : "within a few minutes of the app starting"}
                  </span>
                </>
              ) : (
                <span className="text-orange-50">Automatic backups are off.</span>
              )}
            </p>
            {overdue && (
              <p className="text-muted">
                Check that the backup folder below is still available — for example that a USB drive is plugged in.
              </p>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSaveAuto} className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Clock size={14} className="opacity-70" /> Automatic backups
        </h3>
        <Toggle checked={autoEnabled} onChange={setAutoEnabled} label="Back up automatically" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="How often">
            <Select
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              disabled={!autoEnabled}
            >
              {INTERVALS.map((i) => (
                <option key={i.hours} value={i.hours}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Keep the latest" hint="automatic backups">
            <TextInput
              type="number"
              min={1}
              max={365}
              value={keepCount}
              onChange={(e) => setKeepCount(e.target.value)}
              disabled={!autoEnabled}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">
          If the computer is off when a backup is due, one runs a few minutes after the app next starts. Older
          automatic backups are removed once there are more than this many; manual backups are always kept.
        </p>
        <SaveButton saving={savingAuto} label="Save" />
      </form>

      <form onSubmit={handleSaveFolder} className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <FolderOpen size={14} className="opacity-70" /> Backup folder
        </h3>
        <Field label="Folder path" hint="(leave blank for the default)">
          <TextInput value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={settings?.default_folder} />
        </Field>
        <p className="text-xs text-muted">
          Currently saving to <span className="font-medium text-ink">{settings?.backup_folder}</span>
          {settings?.using_default_folder && " (default)"}. A backup on the same disk as the app won't survive that disk
          failing — for real protection choose a USB drive, a network share, or a OneDrive / Google Drive folder, or
          download a backup regularly and keep it elsewhere.
        </p>
        <SaveButton saving={savingFolder} label="Save folder" />
      </form>

      <div className="flex items-center gap-3">
        <button
          onClick={handleBackupNow}
          disabled={running}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Backing up..." : "Back up now"}
        </button>
        {(message || error) && <p className={`text-sm ${error ? "text-danger" : "text-accent-green"}`}>{error ?? message}</p>}
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-ink">Backups in this folder</h3>
        {backups.length === 0 ? (
          <p className="text-sm text-muted">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="py-1.5">Created</th>
                  <th>Type</th>
                  <th>Contents</th>
                  <th>Size</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {backups.map((b) => {
                  const badge = KIND_BADGES[b.kind] ?? KIND_BADGES.unknown;
                  return (
                    <tr key={b.filename} title={b.filename}>
                      <td className="whitespace-nowrap py-2 pr-3 text-ink">{new Date(b.created_at).toLocaleString()}</td>
                      <td className="pr-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.style}`}>{badge.label}</span>
                      </td>
                      <td className="pr-3 text-muted">
                        {!b.valid
                          ? "Can't be read"
                          : b.includes_uploads
                            ? `Database + ${b.upload_files} file${b.upload_files === 1 ? "" : "s"}`
                            : "Database only"}
                      </td>
                      <td className="whitespace-nowrap pr-3 text-muted">{formatBytes(b.size_bytes)}</td>
                      <td className="whitespace-nowrap py-2 text-right">
                        <button onClick={() => handleDownload(b)} className="mr-3 inline-flex items-center gap-1 text-link hover:underline">
                          <Download size={13} /> Download
                        </button>
                        <button
                          onClick={() => setRestoreTarget({ source: "stored", backup: b })}
                          disabled={!b.valid}
                          className="inline-flex items-center gap-1 text-danger hover:underline disabled:opacity-40"
                        >
                          <RotateCcw size={13} /> Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Upload size={14} className="opacity-70" /> Restore from a file
        </h3>
        <p className="text-xs text-muted">
          For a backup kept somewhere else — a USB drive, or a file copied from another computer.
        </p>
        <input
          type="file"
          accept=".zip,.db"
          onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-wash-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-wash-3"
        />
        <button
          onClick={() => restoreFile && setRestoreTarget({ source: "file", file: restoreFile })}
          disabled={!restoreFile}
          className="rounded-md border border-danger/50 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
        >
          Restore this file
        </button>
      </div>

      {restoreTarget && (
        <RestoreDialog
          target={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onSignOut={logout}
        />
      )}
    </div>
  );
}

function RestoreDialog({ target, onClose, onSignOut }: { target: RestoreTarget; onClose: () => void; onSignOut: () => void }) {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);

  const what =
    target.source === "stored"
      ? `the backup from ${new Date(target.backup.created_at).toLocaleString()}`
      : `the file "${target.file.name}"`;
  const databaseOnly = target.source === "stored" && !target.backup.includes_uploads;

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      setResult(target.source === "stored" ? await restoreBackup(target.backup.filename) : await restoreBackupFromFile(target.file));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "The restore didn't complete."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      // No close button path back into the app: the data and every sign-in
      // just changed underneath this page, so the only way on is to sign in.
      <Modal title="Restore complete" onClose={onSignOut}>
        <div className="space-y-3 text-sm">
          <p className="text-ink">Your data has been restored from {what}.</p>
          <p className="text-muted">
            A copy of the data from just before the restore was saved as{" "}
            <span className="font-medium text-ink">{result.safety_backup}</span>. Restore that if this wasn't the right
            backup.
          </p>
          <p className="text-muted">Everyone, on every computer, now needs to sign in again.</p>
          <div className="flex justify-end pt-2">
            <button onClick={onSignOut} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90">
              Sign in again
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Restore data?" onClose={busy ? () => undefined : onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-ink">
          This replaces <span className="font-semibold">all current data</span> — every company, invoice, customer, user and
          setting — with {what}.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Anything entered after that backup was made will no longer appear.</li>
          <li>
            Before anything changes, a <span className="text-ink">"Before restore"</span> backup of the current data is
            saved, so this can be undone.
          </li>
          <li>Everyone on every computer is signed out and needs to sign in again.</li>
          <li>Ask other users to stop entering data until the restore finishes.</li>
          {databaseOnly && <li>This older-format backup has no uploaded files; current images and PDFs are left as they are.</li>}
        </ul>
        <label className="flex items-center gap-2 pt-1 text-ink">
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={busy} />
          I understand the current data will be replaced
        </label>
        {error && <p className="text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={busy} className="rounded-md px-4 py-2 text-sm text-muted hover:text-ink disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleRestore}
            disabled={!understood || busy}
            className="rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Restoring — please wait..." : "Restore"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
