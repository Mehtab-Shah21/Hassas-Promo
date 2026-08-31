import { useEffect, useRef, useState, type FormEvent } from "react";
import { resolveAssetUrl } from "../../../api/client";
import { updateBusiness, uploadBusinessLogo } from "../../../api/businesses";
import { useBusiness } from "../../../context/BusinessContext";
import { Field, TextInput, SaveButton } from "../../../components/form/Field";

export default function CompanyProfilePage() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setForm({
      name: activeBusiness.name ?? "",
      legal_name: activeBusiness.legal_name ?? "",
      tax_id: activeBusiness.tax_id ?? "",
      cr_no: activeBusiness.cr_no ?? "",
      phone_code: activeBusiness.phone_code ?? "",
      phone: activeBusiness.phone ?? "",
      email: activeBusiness.email ?? "",
      website: activeBusiness.website ?? "",
      address_line1: activeBusiness.address_line1 ?? "",
      address_line2: activeBusiness.address_line2 ?? "",
      city: activeBusiness.city ?? "",
      state: activeBusiness.state ?? "",
      postal_code: activeBusiness.postal_code ?? "",
      country: activeBusiness.country ?? "",
      bank_account_name: activeBusiness.bank_account_name ?? "",
      bank_iban_or_no: activeBusiness.bank_iban_or_no ?? "",
      bank_swift: activeBusiness.bank_swift ?? "",
      bank_name: activeBusiness.bank_name ?? "",
    });
  }, [activeBusiness]);

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

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

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeBusiness) return;
    setUploading(true);
    try {
      await uploadBusinessLogo(activeBusiness.id, file);
      await refreshBusinesses();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!activeBusiness) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">Company Profile — {activeBusiness.name}</h2>
        <p className="text-sm text-muted">Editing the {activeBusiness.name} business profile.</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-line bg-white/5">
          {activeBusiness.logo_path ? (
            <img src={resolveAssetUrl(activeBusiness.logo_path)!} alt="Logo" className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">No logo</span>
          )}
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoChange} />
          {uploading && <p className="text-xs text-muted">Uploading...</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Business name">
          <TextInput value={form.name ?? ""} onChange={set("name")} required />
        </Field>
        <Field label="Legal name">
          <TextInput value={form.legal_name ?? ""} onChange={set("legal_name")} />
        </Field>
        <Field label="Tax ID">
          <TextInput value={form.tax_id ?? ""} onChange={set("tax_id")} />
        </Field>
        <Field label="CR No.">
          <TextInput value={form.cr_no ?? ""} onChange={set("cr_no")} />
        </Field>
        <Field label="Phone code">
          <TextInput value={form.phone_code ?? ""} onChange={set("phone_code")} placeholder="+971" />
        </Field>
        <Field label="Phone">
          <TextInput value={form.phone ?? ""} onChange={set("phone")} />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={form.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="Website">
          <TextInput value={form.website ?? ""} onChange={set("website")} />
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
          <Field label="State / Emirate">
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

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink">Bank details</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account name">
            <TextInput value={form.bank_account_name ?? ""} onChange={set("bank_account_name")} />
          </Field>
          <Field label="Bank name">
            <TextInput value={form.bank_name ?? ""} onChange={set("bank_name")} />
          </Field>
          <Field label="IBAN / Account No.">
            <TextInput value={form.bank_iban_or_no ?? ""} onChange={set("bank_iban_or_no")} />
          </Field>
          <Field label="SWIFT">
            <TextInput value={form.bank_swift ?? ""} onChange={set("bank_swift")} />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} />
        {message && <span className="text-sm text-accent-green">{message}</span>}
      </div>
    </form>
  );
}
