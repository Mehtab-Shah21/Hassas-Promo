import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { clearServerUrl, getServerUrl } from "../../api/client";
import { recoverAccount } from "../../api/recovery";
import Modal from "../../components/Modal";
import { Field, TextInput } from "../../components/form/Field";
import { useAuth } from "../../context/AuthContext";
import { getErrorMessage } from "../../utils/errors";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch {
      setError("Invalid username or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-xl bg-surface p-8 shadow-floating">
        <h1 className="mb-1 text-xl font-semibold text-ink">PRO Invoicing</h1>
        <p className="mb-6 text-sm text-muted">Sign in to continue</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Username</label>
            <input
              type="text"
              autoComplete="username"
              required
              maxLength={50}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Password</label>
            <input
              type="password"
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Forgotten your details?{" "}
          <button type="button" onClick={() => setShowRecovery(true)} className="text-link hover:underline">
            Recover a superadmin account
          </button>
        </p>

        <p className="mt-2 text-center text-xs text-muted">
          Server: {getServerUrl()}{" "}
          <button
            type="button"
            onClick={() => {
              clearServerUrl();
              window.location.reload();
            }}
            className="text-link hover:underline"
          >
            change
          </button>
        </p>

        {showRecovery && (
          <RecoverDialog
            onClose={() => setShowRecovery(false)}
            onRecovered={(recoveredUsername) => {
              setShowRecovery(false);
              setUsername(recoveredUsername);
              setPassword("");
              setError(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The way back in for a superadmin who has forgotten their password, their
 * username, or both. Everyone else asks a superadmin to reset theirs; this
 * exists because a superadmin has nobody above them. It needs the recovery
 * code they generated in Settings > Security while they still had access.
 */
function RecoverDialog({
  onClose,
  onRecovered,
}: {
  onClose: () => void;
  onRecovered: (username: string) => void;
}) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ username: string; message: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setDone(await recoverAccount(code.trim(), newPassword));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "That recovery code isn't valid."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Recover superadmin account" onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-sm">
          <p className="text-ink">{done.message}</p>
          <p className="text-muted">
            Your username is <span className="font-semibold text-ink">{done.username}</span>.
          </p>
          <p className="text-xs text-muted">
            That code has now been used up. Once you're signed in, generate a fresh one from Settings &gt; Security.
          </p>
          <div className="flex justify-end">
            <button
              onClick={() => onRecovered(done.username)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
            >
              Back to sign in
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-muted">
            Enter the recovery code generated from Settings &gt; Security. You don't need your username — we'll tell
            you what it is.
          </p>
          <Field label="Recovery code">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              required
              autoFocus
              className="font-mono tracking-widest"
            />
          </Field>
          <Field label="New password">
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-wash-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Checking..." : "Reset password"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
