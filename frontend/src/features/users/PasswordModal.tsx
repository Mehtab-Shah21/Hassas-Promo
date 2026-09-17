import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { changeOwnPassword, resetUserPassword } from "../../api/users";
import type { AppUser } from "../../api/types";
import { Field, ModalFooter, TextInput } from "../../components/form/Field";
import Modal from "../../components/Modal";
import { getErrorMessage } from "../../utils/errors";

const MIN_LENGTH = 6;

/**
 * One dialog for both password flows on the Users page:
 *  - `target` given: reset someone else's forgotten password (no current
 *    password — the server checks you're allowed to manage that account).
 *  - no `target`: change your own, which does require the current password.
 */
export default function PasswordModal({
  target,
  onClose,
  onDone,
}: {
  target?: AppUser | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const isReset = !!target;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(`The new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      if (isReset) await resetUserPassword(target!.id, next);
      else await changeOwnPassword(current, next);
      onDone();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not update the password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isReset ? `Reset password — ${target!.username}` : "Change your password"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isReset ? (
          <p className="text-sm text-muted">
            Set a new password for <span className="font-medium text-ink">{target!.username}</span>, then share it with
            them. Their old password stops working immediately.
          </p>
        ) : (
          <Field label="Current password" icon={KeyRound}>
            <TextInput
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </Field>
        )}
        <Field label="New password" hint={`(at least ${MIN_LENGTH} characters)`} icon={KeyRound}>
          <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required maxLength={128} />
        </Field>
        <Field label="Confirm new password" icon={KeyRound}>
          <TextInput
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            maxLength={128}
          />
        </Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isReset ? "Reset password" : "Change password"} />
      </form>
    </Modal>
  );
}
