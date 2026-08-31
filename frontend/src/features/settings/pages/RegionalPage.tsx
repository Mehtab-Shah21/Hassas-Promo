import { useEffect, useState, type FormEvent } from "react";
import { updateBusiness } from "../../../api/businesses";
import { useBusiness } from "../../../context/BusinessContext";
import { Field, SaveButton, TextInput } from "../../../components/form/Field";

const CURRENCY_DISPLAY_OPTIONS = [
  { value: "symbol", label: "Symbol (e.g. AED 100)" },
  { value: "code", label: "Code (e.g. 100 AED)" },
];

const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

export default function RegionalPage() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [form, setForm] = useState({
    base_currency: "",
    currency_display: "symbol",
    date_format: "DD/MM/YYYY",
    timezone: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setForm({
      base_currency: activeBusiness.base_currency,
      currency_display: activeBusiness.currency_display,
      date_format: activeBusiness.date_format,
      timezone: activeBusiness.timezone,
    });
  }, [activeBusiness]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeBusiness) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateBusiness(activeBusiness.id, form);
      await refreshBusinesses();
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBusiness) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Regional — {activeBusiness.name}</h2>
        <p className="text-sm text-muted">Currency, currency display, date format and timezone.</p>
      </div>

      <Field label="Base currency">
        <TextInput
          value={form.base_currency}
          onChange={(e) => setForm((f) => ({ ...f, base_currency: e.target.value.toUpperCase() }))}
          placeholder="AED"
          maxLength={10}
        />
      </Field>

      <Field label="Currency display">
        <select
          value={form.currency_display}
          onChange={(e) => setForm((f) => ({ ...f, currency_display: e.target.value }))}
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {CURRENCY_DISPLAY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date format">
        <select
          value={form.date_format}
          onChange={(e) => setForm((f) => ({ ...f, date_format: e.target.value }))}
          className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        >
          {DATE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Timezone">
        <TextInput
          value={form.timezone}
          onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          placeholder="Asia/Dubai"
        />
      </Field>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} />
        {message && <span className="text-sm text-accent-green">{message}</span>}
      </div>
    </form>
  );
}
