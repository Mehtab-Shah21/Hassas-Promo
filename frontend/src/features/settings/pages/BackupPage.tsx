import { useEffect, useState } from "react";
import { getBackupSettings, listBackups, restoreBackup, runBackup, setBackupFolder, type BackupFileInfo } from "../../../api/backup";
import { Field, SaveButton, TextInput } from "../../../components/form/Field";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function BackupPage() {
  const [folder, setFolder] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [running, setRunning] = useState(false);
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const settings = await getBackupSettings();
    setFolder(settings.backup_folder ?? "");
    setBackups(await listBackups());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSaveFolder(e: React.FormEvent) {
    e.preventDefault();
    setSavingFolder(true);
    setError(null);
    try {
      await setBackupFolder(folder);
      setMessage("Backup folder saved.");
      load();
    } catch {
      setError("Could not use that folder — check the path exists and is writable.");
    } finally {
      setSavingFolder(false);
    }
  }

  async function handleBackupNow() {
    setRunning(true);
    setError(null);
    try {
      await runBackup();
      setMessage("Backup created.");
      load();
    } catch {
      setError("Backup failed. Set a backup folder first.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRestore(filename: string) {
    if (!confirm(`Restore from ${filename}? This overwrites the current database. You should restart the backend afterward.`)) return;
    const result = await restoreBackup(filename);
    setMessage(result.message);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Backup & Restore</h2>
        <p className="text-sm text-muted">
          Manual backups only for now — copies the SQLite database file to a folder you choose. For a
          fully automated schedule, point Windows Task Scheduler at{" "}
          <code className="rounded bg-wash-2 px-1">POST /api/backup/run</code> on a timer (see
          PROGRESS.md). Only works for the default SQLite setup; a Postgres deployment needs
          pg_dump/pg_restore instead.
        </p>
      </div>

      <form onSubmit={handleSaveFolder} className="flex items-end gap-3">
        <Field label="Backup folder path" className="flex-1">
          <TextInput value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="C:\Backups\ProInvoicing" required />
        </Field>
        <SaveButton saving={savingFolder} label="Save folder" />
      </form>

      <div>
        <button
          onClick={handleBackupNow}
          disabled={running || !folder}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {running ? "Backing up..." : "Backup now"}
        </button>
      </div>

      {(message || error) && (
        <p className={`text-sm ${error ? "text-danger" : "text-accent-green"}`}>{error ?? message}</p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Existing backups</h3>
        {backups.length === 0 ? (
          <p className="text-sm text-muted">No backups yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-semibold uppercase text-muted">
              <tr><th className="py-1.5">File</th><th>Size</th><th>Created</th><th></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {backups.map((b) => (
                <tr key={b.filename}>
                  <td className="py-2">{b.filename}</td>
                  <td className="py-2 text-muted">{formatBytes(b.size_bytes)}</td>
                  <td className="py-2 text-muted">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => handleRestore(b.filename)} className="text-danger hover:underline">
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
