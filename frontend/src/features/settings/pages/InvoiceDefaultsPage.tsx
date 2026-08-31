import { useEffect, useState, type FormEvent } from "react";
import { updateBusiness } from "../../../api/businesses";
import { useBusiness } from "../../../context/BusinessContext";
import { Field, SaveButton, TextArea, TextInput } from "../../../components/form/Field";

export default function InvoiceDefaultsPage() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [form, setForm] = useState({
    default_vat_rate: "0",
    show_govt_fee_on_invoice: false,
    default_invoice_notes_cash: "",
    default_invoice_terms_cash: "",
    default_invoice_notes_credit: "",
    default_invoice_terms_credit: "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setForm({
      default_vat_rate: String(activeBusiness.default_vat_rate),
      show_govt_fee_on_invoice: activeBusiness.show_govt_fee_on_invoice,
      default_invoice_notes_cash: activeBusiness.default_invoice_notes_cash ?? "",
      default_invoice_terms_cash: activeBusiness.default_invoice_terms_cash ?? "",
      default_invoice_notes_credit: activeBusiness.default_invoice_notes_credit ?? "",
      default_invoice_terms_credit: activeBusiness.default_invoice_terms_credit ?? "",
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
        default_vat_rate: Number(form.default_vat_rate) || 0,
      });
      await refreshBusinesses();
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBusiness) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Invoice Defaults — {activeBusiness.name}</h2>
        <p className="text-sm text-muted">
          Defaults applied to new invoices. Government fee is always stored and counted on the
          dashboard — this only controls whether it's <em>printed</em> on the invoice.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Default VAT rate (%)">
          <TextInput
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={form.default_vat_rate}
            onChange={(e) => setForm((f) => ({ ...f, default_vat_rate: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={form.show_govt_fee_on_invoice}
            onChange={(e) => setForm((f) => ({ ...f, show_govt_fee_on_invoice: e.target.checked }))}
            className="h-4 w-4 rounded border-line"
          />
          <span className="text-sm font-medium text-muted">Show government fee on printed invoice</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Default notes (cash invoices)">
          <TextArea
            rows={3}
            value={form.default_invoice_notes_cash}
            onChange={(e) => setForm((f) => ({ ...f, default_invoice_notes_cash: e.target.value }))}
          />
        </Field>
        <Field label="Default terms (cash invoices)">
          <TextArea
            rows={3}
            value={form.default_invoice_terms_cash}
            onChange={(e) => setForm((f) => ({ ...f, default_invoice_terms_cash: e.target.value }))}
          />
        </Field>
        <Field label="Default notes (credit invoices)">
          <TextArea
            rows={3}
            value={form.default_invoice_notes_credit}
            onChange={(e) => setForm((f) => ({ ...f, default_invoice_notes_credit: e.target.value }))}
          />
        </Field>
        <Field label="Default terms (credit invoices)">
          <TextArea
            rows={3}
            value={form.default_invoice_terms_credit}
            onChange={(e) => setForm((f) => ({ ...f, default_invoice_terms_credit: e.target.value }))}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} />
        {message && <span className="text-sm text-accent-green">{message}</span>}
      </div>
    </form>
  );
}
