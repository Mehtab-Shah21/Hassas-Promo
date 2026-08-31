import { useState, type FormEvent } from "react";
import { createService, updateService, type ServicePayload } from "../../api/services";
import { Field, SaveButton, TextArea, TextInput } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { Service, ServiceCategory } from "../../api/types";

interface Props {
  service?: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: (service: Service) => void;
}

export default function ServiceFormModal({ service, categories, onClose, onSaved }: Props) {
  const isEdit = !!service;
  const [form, setForm] = useState<ServicePayload>(
    service ?? {
      code: "",
      name: "",
      description: "",
      price: 0,
      govt_fee: 0,
      category_id: categories[0]?.id ?? null,
      taxable: true,
      is_active: true,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit ? await updateService(service!.id, form) : await createService(form);
      onSaved(saved);
    } catch {
      setError("Could not save service.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit service" : "Add service"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput
            value={form.name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code">
            <TextInput value={form.code ?? ""} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="Category">
            <select
              value={form.category_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (service fee)">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.price ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            />
          </Field>
          <Field label="Govt. fee">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.govt_fee ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, govt_fee: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <Field label="Description">
          <TextArea
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.taxable ?? true}
            onChange={(e) => setForm((f) => ({ ...f, taxable: e.target.checked }))}
            className="h-4 w-4 rounded border-line"
          />
          Taxable (VAT applies)
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-wash-2">
            Cancel
          </button>
          <SaveButton saving={saving} label={isEdit ? "Save changes" : "Create"} />
        </div>
      </form>
    </Modal>
  );
}
