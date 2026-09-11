import { useState, type FormEvent } from "react";
import { createCustomer, updateCustomer, type CustomerPayload } from "../../api/customers";
import { ModalFooter } from "../../components/form/Field";
import Modal from "../../components/Modal";
import type { Customer } from "../../api/types";
import { CustomerFields } from "./CustomerFields";

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
      id_value: "",
      emirate: null,
      address_line1: "",
      notes: "",
      is_active: true,
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The ID field shown to the user is type-driven ("Emirates ID" for
  // individuals/employees, "TRN No." for companies) — id_kind is derived
  // from type at save time rather than left independently editable, so it
  // can never drift from what's actually displayed (and the PDF template's
  // "Tax/VAT No" vs "National ID" label, which keys off id_kind, stays
  // correct too).
  const idLabel = form.type === "company" ? "TRN No." : "Emirates ID";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: CustomerPayload = {
        ...form,
        id_kind: form.type === "company" ? "vat_tax" : "national_id",
      };
      const saved = isEdit ? await updateCustomer(customer!.id, payload) : await createCustomer(payload);
      onSaved(saved);
    } catch {
      setError("Could not save customer. Check the fields and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit customer" : forcedParentId ? "Add employee" : "Add customer"} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {!forcedParentId && (
          <div className="mb-5 flex gap-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                checked={form.type === "individual"}
                onChange={() => setForm((f) => ({ ...f, type: "individual" }))}
              />
              Individual
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                checked={form.type === "company"}
                onChange={() => setForm((f) => ({ ...f, type: "company" }))}
              />
              Company
            </label>
          </div>
        )}

        <CustomerFields form={form} setForm={setForm} idLabel={idLabel} />

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <ModalFooter
          onCancel={onClose}
          saving={saving}
          submitLabel={isEdit ? "Save changes" : forcedParentId ? "Add employee" : "Create customer"}
        />
      </form>
    </Modal>
  );
}
