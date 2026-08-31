import { useState, type FormEvent } from "react";
import { apiClient } from "../../../api/client";
import { useAuth } from "../../../context/AuthContext";
import { Field, SaveButton, TextInput } from "../../../components/form/Field";

export default function SecurityPage() {
  const { user, refreshUser } = useAuth();

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
    } catch {
      setPasswordError("Current password is incorrect.");
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
        <p className="text-sm text-muted">Change your password, PIN, and session auto-lock timeout.</p>
      </div>

      <form onSubmit={handlePasswordSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Change password</h3>
        <Field label="Current password">
          <TextInput
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <TextInput
            type="password"
            required
            minLength={6}
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

      <form onSubmit={handlePinSubmit} className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Set PIN (4–6 digits)</h3>
        <Field label="New PIN">
          <TextInput
            type="password"
            inputMode="numeric"
            required
            pattern="[0-9]{4,6}"
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
