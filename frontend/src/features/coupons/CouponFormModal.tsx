import { useState, type FormEvent } from "react";
import { Calendar, Hash, Percent, Tag } from "lucide-react";
import { createCoupon, updateCoupon, type CouponPayload } from "../../api/coupons";
import type { Coupon } from "../../api/types";
import { useBusiness } from "../../context/BusinessContext";
import Modal from "../../components/Modal";
import { Field, ModalFooter, Select, TextInput, Toggle } from "../../components/form/Field";
import { currencyLabel } from "../../utils/currency";

export default function CouponFormModal({
  coupon,
  onClose,
  onSaved,
}: {
  coupon?: Coupon | null;
  onClose: () => void;
  onSaved: (c: Coupon) => void;
}) {
  const { activeBusiness } = useBusiness();
  const isEdit = !!coupon;
  const [form, setForm] = useState<CouponPayload>(
    coupon ?? {
      code: "",
      discount_type: "percent",
      is_active: true,
      valid_to: "",
    },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.value === undefined) {
      setError("Enter a discount value.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, valid_to: form.valid_to || null, max_uses: form.max_uses ?? null };
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
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          <Field label="Code" icon={Tag}>
            <TextInput
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="e.g. WELCOME10"
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Discount type" icon={Percent}>
              <Select
                value={form.discount_type ?? "percent"}
                onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value as CouponPayload["discount_type"] }))}
              >
                <option value="percent">Percent</option>
                <option value="fixed">Fixed amount</option>
              </Select>
            </Field>
            <Field label="Value" icon={Hash}>
              <TextInput
                type="number"
                step="any"
                min="0"
                placeholder="10"
                suffix={form.discount_type === "fixed" ? currencyLabel(activeBusiness) : "%"}
                value={form.value ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value === "" ? undefined : Number(e.target.value) }))}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Valid to" hint="(optional)" icon={Calendar}>
              <TextInput type="date" value={form.valid_to ?? ""} onChange={(e) => setForm((f) => ({ ...f, valid_to: e.target.value }))} />
            </Field>
            <Field label="Max uses" hint="(optional)" icon={Hash}>
              <TextInput
                type="number"
                step="1"
                min="1"
                placeholder="Unlimited"
                value={form.max_uses ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value === "" ? null : Number(e.target.value) }))}
              />
            </Field>
          </div>

          {isEdit && (
            <p className="text-xs text-muted">
              Used {coupon!.times_used} time{coupon!.times_used === 1 ? "" : "s"}
              {form.max_uses ? ` of ${form.max_uses}` : ""} so far. The coupon deactivates itself automatically once
              the usage limit is reached.
            </p>
          )}

          <div className="pt-1">
            <Toggle
              checked={form.is_active ?? true}
              onChange={(checked) => setForm((f) => ({ ...f, is_active: checked }))}
              label="Active"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
        </div>

        <ModalFooter onCancel={onClose} saving={saving} submitLabel={isEdit ? "Save changes" : "Create coupon"} />
      </form>
    </Modal>
  );
}
