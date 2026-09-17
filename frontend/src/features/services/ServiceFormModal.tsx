import { useState, type FormEvent } from "react";
import { Banknote, CreditCard, DollarSign, FileText, FolderTree, Landmark, Type } from "lucide-react";
import { createService, updateService, type ServicePayload } from "../../api/services";
import { Field, ModalFooter, Select, TextArea, TextInput, Toggle } from "../../components/form/Field";
import Modal from "../../components/Modal";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";
import type { Service, ServiceCategory } from "../../api/types";

interface Props {
  service?: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSaved: (service: Service) => void;
}

export default function ServiceFormModal({ service, categories, onClose, onSaved }: Props) {
  const { activeBusiness } = useBusiness();
  const isEdit = !!service;
  const [form, setForm] = useState<ServicePayload>(
    service ?? {
      name: "",
      description: "",
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

  const currency = currencyLabel(activeBusiness);

  return (
    <Modal title={isEdit ? "Edit service" : "Add service"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Field label="Name" icon={Type}>
            <TextInput
              value={form.name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Passport renewal"
              required
            />
          </Field>

          <Field label="Category" icon={FolderTree}>
            <Select
              value={form.category_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Service fee" icon={DollarSign}>
              <TextInput
                type="number"
                step="any"
                min="0"
                placeholder="1500"
                prefix={currency}
                value={form.price ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </Field>
            <Field label="Govt. fee" icon={Landmark}>
              <TextInput
                type="number"
                step="any"
                min="0"
                placeholder="200"
                prefix={currency}
                value={form.govt_fee ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, govt_fee: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Bank fee" hint="(optional)" icon={Banknote}>
              <TextInput
                type="number"
                step="any"
                min="0"
                placeholder="0"
                prefix={currency}
                value={form.bank_fee ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, bank_fee: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </Field>
            <Field label="E-Drh fee" hint="(optional)" icon={CreditCard}>
              <TextInput
                type="number"
                step="any"
                min="0"
                placeholder="0"
                prefix={currency}
                value={form.edrh_fee ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, edrh_fee: e.target.value === "" ? undefined : Number(e.target.value) }))}
              />
            </Field>
          </div>

          <Field label="Description" hint="(optional)" icon={FileText}>
            <TextArea
              rows={3}
              placeholder="Short summary shown to customers"
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>

          <div className="pt-1">
            <Toggle
              checked={form.taxable ?? true}
              onChange={(checked) => setForm((f) => ({ ...f, taxable: checked }))}
              label="Taxable (VAT applies)"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isEdit ? "Save changes" : "Create service"} />
      </form>
    </Modal>
  );
}
