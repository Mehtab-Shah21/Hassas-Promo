import { useState, type FormEvent } from "react";
import { createCustomer, updateCustomer, type CustomerPayload } from "../../api/customers";
import { Field, SaveButton, TextArea, TextInput } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { Customer } from "../../api/types";

interface Props {
  customer?: Customer | null;
  forcedParentId?: number | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

export default function CustomerFormModal({ customer, forcedParentId, onClose, onSaved }: Props) {
  const isEdit = !!customer;
  const [form, setForm] = useState<CustomerPayload>(
    customer ?? {
      type: "individual",
      name: "",
      email: "",
      phone_code: "",
      phone: "",
      parent_customer_id: forcedParentId ?? null,
      id_kind: "vat_tax",
      id_value: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "",
      notes: "",
      is_active: true,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CustomerPayload>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }) as CustomerPayload);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = isEdit ? await updateCustomer(customer!.id, form) : await createCustomer(form);
      onSaved(saved);
    } catch {
      setError("Could not save customer. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit customer" : forcedParentId ? "Add employee" : "Add customer"} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {!forcedParentId && (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.type === "individual"}
                onChange={() => setForm((f) => ({ ...f, type: "individual" }))}
              />
              Individual
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={form.type === "company"}
                onChange={() => setForm((f) => ({ ...f, type: "company" }))}
              />
              Company
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" className="col-span-2">
            <TextInput value={form.name ?? ""} onChange={set("name")} required />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={form.email ?? ""} onChange={set("email")} />
          </Field>
          <Field label="Phone">
            <div className="flex gap-2">
              <TextInput
                value={form.phone_code ?? ""}
                onChange={set("phone_code")}
                placeholder="+971"
                className="w-20"
              />
              <TextInput value={form.phone ?? ""} onChange={set("phone")} className="flex-1" />
            </div>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Field label="ID type">
            <select
              value={form.id_kind ?? "vat_tax"}
              onChange={(e) => setForm((f) => ({ ...f, id_kind: e.target.value as CustomerPayload["id_kind"] }))}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="vat_tax">VAT / Tax No.</option>
              <option value="national_id">National ID</option>
            </select>
          </Field>
          <Field label="ID value" className="col-span-2">
            <TextInput value={form.id_value ?? ""} onChange={set("id_value")} />
          </Field>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Address</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Address line 1" className="col-span-2">
              <TextInput value={form.address_line1 ?? ""} onChange={set("address_line1")} />
            </Field>
            <Field label="Address line 2" className="col-span-2">
              <TextInput value={form.address_line2 ?? ""} onChange={set("address_line2")} />
            </Field>
            <Field label="City">
              <TextInput value={form.city ?? ""} onChange={set("city")} />
            </Field>
            <Field label="State">
              <TextInput value={form.state ?? ""} onChange={set("state")} />
            </Field>
            <Field label="Postal code">
              <TextInput value={form.postal_code ?? ""} onChange={set("postal_code")} />
            </Field>
            <Field label="Country">
              <TextInput value={form.country ?? ""} onChange={set("country")} />
            </Field>
          </div>
        </div>

        <Field label="Notes">
          <TextArea rows={2} value={form.notes ?? ""} onChange={set("notes")} />
        </Field>

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
