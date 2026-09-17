import { useEffect, useState, type FormEvent } from "react";
import { Calendar, Hash, ImageIcon, Percent, Tag } from "lucide-react";
import { createCoupon, updateCoupon, uploadCouponBanner, type CouponPayload } from "../../api/coupons";
import { resolveAssetUrl } from "../../api/client";
import type { Coupon, CouponKind } from "../../api/types";
import { useBusiness } from "../../context/BusinessContext";
import Modal from "../../components/Modal";
import { Field, ModalFooter, RadioGroup, Select, TextInput, Toggle } from "../../components/form/Field";
import { currencyLabel } from "../../utils/currency";
import { getErrorMessage } from "../../utils/errors";

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
      kind: "discount",
      discount_type: "percent",
      is_active: true,
      valid_to: "",
    },
  );
  // A coupon's type is chosen once, at creation — switching an existing
  // discount into a banner (or back) would leave half-filled data behind.
  const kind: CouponKind = form.kind ?? "discount";
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(resolveAssetUrl(coupon?.banner_path));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the newly picked file straight away; blob URLs must be revoked.
  useEffect(() => {
    if (!bannerFile) return;
    const url = URL.createObjectURL(bannerFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "discount" && form.value === undefined) {
      setError("Enter a discount value.");
      return;
    }
    if (kind === "banner" && !bannerFile && !coupon?.banner_path) {
      setError("Choose the banner image to print on invoices.");
      return;
    }
    setSaving(true);
    let saved: Coupon;
    try {
      const base = { ...form, valid_to: form.valid_to || null, max_uses: form.max_uses ?? null };
      // A banner discounts nothing; the server enforces this too.
      const payload = kind === "banner" ? { ...base, kind, discount_type: "fixed" as const, value: 0 } : base;
      saved = isEdit ? await updateCoupon(coupon!.id, payload) : await createCoupon(payload);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not save coupon. Code might already be in use."));
      setSaving(false);
      return;
    }
    if (kind === "banner" && bannerFile) {
      try {
        saved = await uploadCouponBanner(saved.id, bannerFile);
      } catch (err: unknown) {
        // The coupon itself saved — say so, so a retry edits it rather than
        // creating a duplicate. It won't be offered on invoices until it has
        // an image.
        setError(`Coupon saved, but the image didn't upload: ${getErrorMessage(err, "try again")}. Open it with Edit to retry.`);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    onSaved(saved);
  }

  return (
    <Modal title={isEdit ? "Edit coupon" : "Add coupon"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-5">
          {!isEdit && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-muted">Coupon type</span>
              <RadioGroup
                value={kind}
                onChange={(k) => setForm((f) => ({ ...f, kind: k }))}
                options={[
                  { value: "discount" as const, label: "Discount" },
                  { value: "banner" as const, label: "Printed banner" },
                ]}
              />
              <p className="mt-1.5 text-xs text-muted">
                {kind === "discount"
                  ? "Takes money off the invoice it's applied to."
                  : "Prints your banner image on the invoice — e.g. a partner offer. It doesn't change the invoice total."}
              </p>
            </div>
          )}

          <Field label="Code" icon={Tag}>
            <TextInput
              value={form.code ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder={kind === "banner" ? "e.g. ENDCAFE15" : "e.g. WELCOME10"}
              required
              maxLength={50}
            />
          </Field>

          {kind === "discount" ? (
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
          ) : (
            <Field label="Banner image" hint="(PNG or JPG, wide — about 3:1, e.g. 1500 × 500)" icon={ImageIcon}>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-wash-2 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-wash-3"
              />
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Banner preview"
                  className="mt-3 max-h-32 w-full rounded-md border border-line bg-white object-contain"
                />
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Valid till" hint="(optional)" icon={Calendar}>
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
