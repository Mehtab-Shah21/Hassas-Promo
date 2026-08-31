import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, children, className }: FieldProps) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${props.className ?? ""}`}
    />
  );
}

export function SaveButton({ saving, label = "Save changes" }: { saving: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-raised transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {saving ? "Saving..." : label}
    </button>
  );
}
