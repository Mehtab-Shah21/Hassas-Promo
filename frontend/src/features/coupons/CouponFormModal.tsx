import { useState, type FormEvent } from "react";
import { createCoupon, updateCoupon, type CouponPayload } from "../../api/coupons";
import type { Coupon } from "../../api/types";
import Modal from "../../components/Modal";
import { Field, SaveButton, TextInput } from "../../components/form/Field";

export default function CouponFormModal({
  coupon,
  onClose,
  onSaved,
}: {
  coupon?: Coupon | null;
  onClose: () => void;
  onSaved: (c: Coupon) => void;
}) {
  const isEdit = !!coupon;
  const [form, setForm] = useState<CouponPayload>(
    coupon ?? {
      code: "",
      discount_type: "percent",
      value: 0,
      is_active: true,
      valid_from: "",
      valid_to: "",
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, valid_from: form.valid_from || null, valid_to: form.valid_to || null };
      const saved = isEdit ? await updateCoupon(coupon!.id, payload) : await createCoupon(payload);
      onSaved(saved);
    } catch {
      setError("Could not save coupon. Code might already be in use.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit coupon" : "Add coupon"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Code">
          <TextInput
            value={form.code ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Discount type">
            <select
              value={form.discount_type ?? "percent"}
              onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as CouponPayload["discount_type"] }))}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </Field>
          <Field label="Value">
            <TextInput
              type="number"
              step="0.01"
              min="0"
              value={form.value ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valid from (optional)">
            <TextInput type="date" value={form.valid_from ?? ""} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
          </Field>
          <Field label="Valid to (optional)">
            <TextInput type="date" value={form.valid_to ?? ""} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active ?? true}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
          />
          Active
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
