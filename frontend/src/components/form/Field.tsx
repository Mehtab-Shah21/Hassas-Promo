import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";

interface FieldProps {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, icon: Icon, children, className }: FieldProps) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
        {Icon && <Icon size={14} className="opacity-70" />}
        {label}
        {hint && <span className="font-normal text-muted opacity-70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputBase =
  "w-full rounded-lg border border-line bg-bg px-4 py-3 text-sm text-ink placeholder:text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefix?: string;
  suffix?: string;
}

export function TextInput({ prefix, suffix, className, ...props }: TextInputProps) {
  if (prefix || suffix) {
    return (
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 text-sm font-medium text-muted">{prefix}</span>
        )}
        <input
          {...props}
          className={`${inputBase} ${prefix ? "pl-14" : ""} ${suffix ? "pr-11" : ""} ${className ?? ""}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3.5 text-sm font-medium text-muted">{suffix}</span>
        )}
      </div>
    );
  }
  return <input {...props} className={`${inputBase} ${className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputBase} resize-none ${props.className ?? ""}`} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${inputBase} cursor-pointer appearance-none pr-9 ${className ?? ""}`}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

export function RadioGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-bg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
            value === opt.value ? "bg-accent text-ink" : "text-muted hover:text-ink"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="group flex items-center gap-3 disabled:opacity-50"
    >
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-line"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
      {label && <span className="text-sm font-medium text-ink">{label}</span>}
    </button>
  );
}

export function SaveButton({ saving, label = "Save changes" }: { saving: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-ink shadow-raised transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
    >
      {saving ? "Saving..." : label}
    </button>
  );
}

export function CancelButton({ onClick, label = "Cancel" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-wash-2 hover:text-ink"
    >
      {label}
    </button>
  );
}

export function ModalFooter({
  onCancel,
  saving,
  submitLabel,
}: {
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-line pt-5">
      <CancelButton onClick={onCancel} />
      <SaveButton saving={saving} label={submitLabel} />
    </div>
  );
}
