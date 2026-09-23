import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { apiClient } from "../../../api/client";
import { generateRecoveryCode, getRecoveryStatus } from "../../../api/recovery";
import { useAuth } from "../../../context/AuthContext";
import { Field, SaveButton, TextInput } from "../../../components/form/Field";
import { getErrorMessage } from "../../../utils/errors";

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();
  // Employees can't set their own password — a superadmin resets it for them
  // (enforced server-side in /api/auth/change-password too).
  const canChangePassword = user?.role !== "employee";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [pin, setPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const [autoLock, setAutoLock] = useState(String(user?.auto_lock_minutes ?? 15));
  const [autoLockSaving, setAutoLockSaving] = useState(false);
  const [autoLockMessage, setAutoLockMessage] = useState<string | null>(null);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordMessage(null);
    try {
      await apiClient.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage("Password updated.");
    } catch (err: unknown) {
      setPasswordError(getErrorMessage(err, "Could not update the password."));
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    setPinSaving(true);
    setPinError(null);
    setPinMessage(null);
    try {
      await apiClient.post("/api/auth/set-pin", { pin });
      setPin("");
      setPinMessage("PIN updated.");
    } catch {
      setPinError("PIN must be 4-6 digits.");
    } finally {
      setPinSaving(false);
    }
  }

  async function handleAutoLockSubmit(e: FormEvent) {
    e.preventDefault();
    setAutoLockSaving(true);
    setAutoLockMessage(null);
    try {
      await apiClient.post("/api/auth/set-auto-lock", { auto_lock_minutes: Number(autoLock) });
      await refreshUser();
      setAutoLockMessage("Saved.");
    } finally {
      setAutoLockSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-ink">Security</h2>
        <p className="text-sm text-muted">
          {canChangePassword ? "Change your password, PIN, and session auto-lock timeout." : "Set your PIN and session auto-lock timeout."}
        </p>
      </div>

      {!canChangePassword ? (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-ink">Password</h3>
          <p className="text-sm text-muted">
            Employee passwords are managed by a superadmin. If you've forgotten yours, ask them to reset it.
          </p>
        </div>
      ) : (
      <form onSubmit={handlePasswordSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Change password</h3>
        <Field label="Current password">
          <TextInput
            type="password"
            required
            maxLength={128}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <TextInput
            type="password"
            required
            minLength={6}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
        <div className="flex items-center gap-3">
          <SaveButton saving={passwordSaving} label="Update password" />
          {passwordMessage && <span className="text-sm text-accent-green">{passwordMessage}</span>}
        </div>
      </form>
      )}

      <form onSubmit={handlePinSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Set PIN (4–6 digits)</h3>
        <Field label="New PIN">
          <TextInput
            type="password"
            inputMode="numeric"
            required
            pattern="[0-9]{4,6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </Field>
        {pinError && <p className="text-sm text-danger">{pinError}</p>}
        <div className="flex items-center gap-3">
          <SaveButton saving={pinSaving} label="Update PIN" />
          {pinMessage && <span className="text-sm text-accent-green">{pinMessage}</span>}
        </div>
      </form>

      {user?.role === "superadmin" && <RecoverySection />}

      <form onSubmit={handleAutoLockSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Session auto-lock</h3>
        <Field label="Lock after (minutes of inactivity)">
          <TextInput
            type="number"
            min={1}
            max={120}
            value={autoLock}
            onChange={(e) => setAutoLock(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-3">
          <SaveButton saving={autoLockSaving} label="Save" />
          {autoLockMessage && <span className="text-sm text-accent-green">{autoLockMessage}</span>}
        </div>
      </form>
    </div>
  );
}

/**
 * A superadmin has nobody above them to reset their password — everyone else
 * asks a superadmin. This is their way back in: a code generated now, kept
 * somewhere safe (printed, in a safe, in a password manager), and usable on
 * the sign-in screen to recover BOTH the username and the password.
 */
function RecoverySection() {
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecoveryStatus()
      .then((s) => setHasCode(s.has_recovery_code))
      .catch(() => setHasCode(null));
  }, []);

  async function handleGenerate() {
    if (
      hasCode &&
      !confirm("Generating a new code immediately invalidates the existing one. Continue?")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await generateRecoveryCode();
      setIssued(res.recovery_code);
      setHasCode(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not generate a recovery code."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <KeyRound size={14} className="opacity-70" /> Account recovery
      </h3>
      <p className="text-sm text-muted">
        You're a superadmin, so there's no one above you to reset your password if you forget it. A recovery code
        is your way back in — it works even if you've forgotten your username too.
      </p>

      {issued ? (
        <div className="space-y-2 rounded-lg border border-accent-green/40 bg-accent-green/10 p-4">
          <p className="text-sm font-medium text-ink">Write this down now — it is shown only once:</p>
          <p className="select-all rounded-md bg-bg px-3 py-2 text-center font-mono text-lg tracking-widest text-ink">
            {issued}
          </p>
          <p className="text-xs text-muted">
            Keep it somewhere safe and away from this PC. It can be used once, by anyone who has it, to reset this
            account's password — so treat it like a spare key.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-line p-3">
          <ShieldAlert
            size={16}
            className={`mt-0.5 shrink-0 ${hasCode ? "text-accent-green" : "text-orange-50"}`}
          />
          <p className="text-sm text-muted">
            {hasCode === null
              ? "Checking..."
              : hasCode
                ? "A recovery code has been generated for this account. If you've lost it, generate a new one — the old one stops working."
                : "No recovery code yet. Generate one and store it somewhere safe."}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Generating..." : hasCode ? "Generate a new code" : "Generate recovery code"}
      </button>
    </div>
  );
}
