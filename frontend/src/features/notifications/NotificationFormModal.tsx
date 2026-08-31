import { useCallback, useState, type FormEvent } from "react";
import { createNotification, createNotificationType, type ReminderInput } from "../../api/notifications";
import { listCustomers } from "../../api/customers";
import type { Customer, NotificationType, ReminderUnit } from "../../api/types";
import Modal from "../../components/Modal";
import SearchCombobox from "../../components/SearchCombobox";
import { Field, SaveButton, TextArea, TextInput } from "../../components/form/Field";

export default function NotificationFormModal({
  types,
  onTypesChanged,
  onClose,
  onSaved,
}: {
  types: NotificationType[];
  onTypesChanged: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [typeId, setTypeId] = useState<number | "">("");
  const [newTypeName, setNewTypeName] = useState("");
  const [note, setNote] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [reminders, setReminders] = useState<ReminderInput[]>([{ offset_value: 1, offset_unit: "week" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await listCustomers({ search: query || undefined, page: 1, page_size: 15 });
    return res.items;
  }, []);

  async function handleAddType() {
    if (!newTypeName.trim()) return;
    const created = await createNotificationType(newTypeName.trim());
    setNewTypeName("");
    onTypesChanged();
    setTypeId(created.id);
  }

  function updateReminder(i: number, patch: Partial<ReminderInput>) {
    setReminders((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeReminder(i: number) {
    setReminders((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customer || !typeId || !targetDate) {
      setError("Customer, type, and target date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createNotification({
        customer_id: customer.id,
        type_id: Number(typeId),
        note: note || null,
        target_date: targetDate,
        reminders,
      });
      onSaved();
    } catch {
      setError("Could not save notification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New notification" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Customer</span>
          {customer ? (
            <div className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
              <span>{customer.name}</span>
              <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted hover:text-muted">
                change
              </button>
            </div>
          ) : (
            <SearchCombobox<Customer>
              placeholder="Search customers..."
              fetchOptions={fetchCustomers}
              getLabel={(c) => c.name}
              getSubLabel={(c) => c.phone}
              onSelect={setCustomer}
            />
          )}
        </div>

        <Field label="Type">
          <div className="flex gap-2">
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">— select —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex gap-2">
            <TextInput
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="Add new type..."
              className="flex-1"
            />
            <button type="button" onClick={handleAddType} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5">
              Add
            </button>
          </div>
        </Field>

        <Field label="Target date">
          <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
        </Field>

        <Field label="Note">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Reminders</span>
          <div className="space-y-2">
            {reminders.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <TextInput
                  type="number"
                  min="1"
                  value={r.offset_value}
                  onChange={(e) => updateReminder(i, { offset_value: Number(e.target.value) })}
                  className="w-20"
                />
                <select
                  value={r.offset_unit}
                  onChange={(e) => updateReminder(i, { offset_unit: e.target.value as ReminderUnit })}
                  className="rounded-md border border-line px-2 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="day">day(s) before</option>
                  <option value="week">week(s) before</option>
                  <option value="month">month(s) before</option>
                </select>
                <button type="button" onClick={() => removeReminder(i)} className="text-muted hover:text-danger">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReminders((prev) => [...prev, { offset_value: 1, offset_unit: "day" }])}
            className="mt-2 text-sm font-medium text-accent hover:underline"
          >
            + Add reminder
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-white/10">
            Cancel
          </button>
          <SaveButton saving={saving} label="Create" />
        </div>
      </form>
    </Modal>
  );
}
