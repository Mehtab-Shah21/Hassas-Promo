import { useCallback, useState, type FormEvent } from "react";
import { createNotification, type ReminderInput } from "../../api/notifications";
import { listCustomers } from "../../api/customers";
import { listServices } from "../../api/services";
import type { Customer, ReminderUnit, Service } from "../../api/types";
import { NOTIFIABLE_MODULES } from "../../constants/notifiableModules";
import Modal from "../../components/Modal";
import SearchCombobox from "../../components/SearchCombobox";
import { Field, SaveButton, TextArea, TextInput } from "../../components/form/Field";

export default function NotificationFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [note, setNote] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [visibilityModules, setVisibilityModules] = useState<string[]>([]);
  const [reminders, setReminders] = useState<ReminderInput[]>([{ offset_value: 1, offset_unit: "week" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await listCustomers({ search: query || undefined, page: 1, page_size: 15 });
    return res.items;
  }, []);

  const fetchServices = useCallback(async (query: string) => {
    const res = await listServices({ search: query || undefined, page: 1, page_size: 15 });
    return res.items;
  }, []);

  function toggleModule(to: string) {
    setVisibilityModules((prev) => (prev.includes(to) ? prev.filter((m) => m !== to) : [...prev, to]));
  }

  function updateReminder(i: number, patch: Partial<ReminderInput>) {
    setReminders((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeReminder(i: number) {
    setReminders((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customer || !service || !targetDate) {
      setError("Customer, service, and target date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createNotification({
        customer_id: customer.id,
        service_id: service.id,
        note: note || null,
        target_date: targetDate,
        visibility_modules: visibilityModules,
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

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Service</span>
          {service ? (
            <div className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
              <span>{service.name}</span>
              <button type="button" onClick={() => setService(null)} className="text-xs text-muted hover:text-muted">
                change
              </button>
            </div>
          ) : (
            <SearchCombobox<Service>
              placeholder="Search services..."
              fetchOptions={fetchServices}
              getLabel={(s) => s.name}
              getSubLabel={(s) => s.code}
              onSelect={setService}
            />
          )}
        </div>

        <Field label="Target date">
          <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
        </Field>

        <Field label="Note">
          <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-muted">Visible on</span>
          <div className="grid grid-cols-2 gap-1.5 rounded-md border border-line p-3">
            {NOTIFIABLE_MODULES.map((m) => (
              <label key={m.to} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={visibilityModules.includes(m.to)}
                  onChange={() => toggleModule(m.to)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            Selected modules show a red dot in the nav while this notification is active.
          </p>
        </div>

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
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-wash-2">
            Cancel
          </button>
          <SaveButton saving={saving} label="Create" />
        </div>
      </form>
    </Modal>
  );
}
