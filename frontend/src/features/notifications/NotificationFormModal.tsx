import { useCallback, useState, type FormEvent } from "react";
import { Briefcase, Calendar, FileText, Hash, User } from "lucide-react";
import { createNotification, type ReminderInput } from "../../api/notifications";
import { listCustomers } from "../../api/customers";
import { listServices } from "../../api/services";
import type { Customer, ReminderUnit, Service } from "../../api/types";
import Modal from "../../components/Modal";
import SearchCombobox from "../../components/SearchCombobox";
import { Field, ModalFooter, Select, TextArea, TextInput } from "../../components/form/Field";

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
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Field label="Customer" icon={User}>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border border-line bg-bg px-4 py-3 text-sm text-ink">
                <span>{customer.name}</span>
                <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted hover:text-ink">
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
          </Field>

          <Field label="Service" icon={Briefcase}>
            {service ? (
              <div className="flex items-center justify-between rounded-lg border border-line bg-bg px-4 py-3 text-sm text-ink">
                <span>{service.name}</span>
                <button type="button" onClick={() => setService(null)} className="text-xs text-muted hover:text-ink">
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
          </Field>

          <Field label="Target date" icon={Calendar}>
            <TextInput type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} required />
          </Field>

          <Field label="Note" hint="(optional)" icon={FileText}>
            <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>

          <Field label="Reminders" icon={Hash}>
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
                  <Select
                    value={r.offset_unit}
                    onChange={(e) => updateReminder(i, { offset_unit: e.target.value as ReminderUnit })}
                  >
                    <option value="day">day(s) before</option>
                    <option value="week">week(s) before</option>
                    <option value="month">month(s) before</option>
                  </Select>
                  <button type="button" onClick={() => removeReminder(i)} className="text-muted hover:text-danger">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setReminders((prev) => [...prev, { offset_value: 1, offset_unit: "day" }])}
              className="mt-2 text-sm font-medium text-link hover:underline"
            >
              + Add reminder
            </button>
          </Field>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel="Create" />
      </form>
    </Modal>
  );
}
