import { useEffect, useState, type FormEvent } from "react";
import { updateBusiness } from "../../../api/businesses";
import { useBusiness } from "../../../context/BusinessContext";
import { Field, SaveButton, TextArea, TextInput } from "../../../components/form/Field";

export default function QuotationDefaultsPage() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [form, setForm] = useState({
    default_quotation_validity_days: "30",
    default_quotation_notes: "",
    default_quotation_terms: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setForm({
      default_quotation_validity_days: String(activeBusiness.default_quotation_validity_days),
      default_quotation_notes: activeBusiness.default_quotation_notes ?? "",
      default_quotation_terms: activeBusiness.default_quotation_terms ?? "",
    });
  }, [activeBusiness]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeBusiness) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateBusiness(activeBusiness.id, {
        ...form,
        default_quotation_validity_days: Number(form.default_quotation_validity_days) || 30,
      });
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
        <h2 className="text-lg font-semibold text-ink">Quotation Defaults — {activeBusiness.name}</h2>
      </div>

      <Field label="Default validity (days)">
        <TextInput
          type="number"
          min="1"
          value={form.default_quotation_validity_days}
          onChange={(e) => setForm((f) => ({ ...f, default_quotation_validity_days: e.target.value }))}
        />
      </Field>

      <Field label="Default notes">
        <TextArea
          rows={3}
          value={form.default_quotation_notes}
          onChange={(e) => setForm((f) => ({ ...f, default_quotation_notes: e.target.value }))}
        />
      </Field>

      <Field label="Default terms">
        <TextArea
          rows={3}
          value={form.default_quotation_terms}
          onChange={(e) => setForm((f) => ({ ...f, default_quotation_terms: e.target.value }))}
        />
      </Field>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} />
        {message && <span className="text-sm text-accent-green">{message}</span>}
      </div>
    </form>
  );
}
