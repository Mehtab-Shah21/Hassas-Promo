import type { Dispatch, SetStateAction } from "react";
import { FileText, IdCard, Landmark, Mail, MapPin, Phone, User } from "lucide-react";
import type { CustomerPayload } from "../../api/customers";
import type { Emirate } from "../../api/types";
import { Field, Select, TextArea, TextInput } from "../../components/form/Field";

const EMIRATES: Emirate[] = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Fujairah",
  "Ras Al Khaimah",
];

// The individual-shaped field set: Name, Email, Phone, an ID field (labeled
// per idLabel — "Emirates ID" for individuals/employees, "TRN No." for
// companies), Emirates, Address line 1, Notes. Shared verbatim between "add
// individual customer" and "add company employee" (both are plain
// individual-type customer rows — an employee just also carries a
// parent_customer_id) so the two flows can never drift apart, and reused
// by the company form since its fields are identical apart from the ID
// label.
export function CustomerFields({
  form,
  setForm,
  idLabel,
}: {
  form: CustomerPayload;
  setForm: Dispatch<SetStateAction<CustomerPayload>>;
  idLabel: string;
}) {
  function set<K extends keyof CustomerPayload>(field: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }) as CustomerPayload);
  }

  return (
    <div className="space-y-5">
      <Field label="Name" icon={User}>
        <TextInput value={form.name ?? ""} onChange={set("name")} required maxLength={255} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Email" hint="(optional)" icon={Mail}>
          <TextInput type="email" value={form.email ?? ""} onChange={set("email")} />
        </Field>
        <Field label="Phone" hint="(optional)" icon={Phone}>
          <TextInput value={form.phone ?? ""} onChange={set("phone")} placeholder="+971 50 123 4567" maxLength={50} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label={idLabel} hint="(optional)" icon={IdCard}>
          <TextInput value={form.id_value ?? ""} onChange={set("id_value")} maxLength={100} />
        </Field>
        <Field label="Emirates" icon={Landmark}>
          <Select
            value={form.emirate ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, emirate: (e.target.value || null) as Emirate | null }))}
          >
            <option value="">Select an emirate</option>
            {EMIRATES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Address line 1" hint="(optional)" icon={MapPin}>
        <TextInput value={form.address_line1 ?? ""} onChange={set("address_line1")} />
      </Field>

      <Field label="Notes" hint="(optional)" icon={FileText}>
        <TextArea rows={2} value={form.notes ?? ""} onChange={set("notes")} />
      </Field>
    </div>
  );
}
