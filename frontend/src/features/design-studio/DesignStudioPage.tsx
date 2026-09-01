import { useEffect, useRef, useState } from "react";
import { updateBusiness } from "../../api/businesses";
import {
  fetchPreviewHtml,
  fetchThermalPreviewHtml,
  getDefaultTemplateConfig,
  getDefaultThermalConfig,
  type DocKind,
  type TemplateConfig,
  type ThermalConfig,
} from "../../api/designStudio";
import type { Business } from "../../api/types";
import { useBusiness } from "../../context/BusinessContext";

const BILL_TO_FIELD_OPTIONS = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "tax_id", label: "Tax / National ID" },
];

const COLOR_PRESETS: { name: string; primary: string; accent: string }[] = [
  { name: "Indigo / Violet", primary: "#4F46E5", accent: "#7C3AED" },
  { name: "Emerald / Teal", primary: "#059669", accent: "#0D9488" },
  { name: "Slate / Blue", primary: "#334155", accent: "#2563EB" },
  { name: "Rose / Amber", primary: "#E11D48", accent: "#D97706" },
  { name: "Blue / Cyan", primary: "#1D4ED8", accent: "#0891B2" },
  { name: "Amber / Orange", primary: "#B45309", accent: "#EA580C" },
  { name: "Charcoal / Gold", primary: "#292524", accent: "#CA8A04" },
  { name: "Forest / Lime", primary: "#166534", accent: "#65A30D" },
];

// The only 3 fonts xhtml2pdf reliably renders in the actual PDF (verified —
// custom @font-face TTF embedding fails on this stack even with a valid
// local file). Named for what they really are, not for a font we can't
// deliver — the live preview and the PDF always show the same one.
const FONT_FAMILY_OPTIONS: { value: TemplateConfig["font_family"]; label: string }[] = [
  { value: "sans", label: "Sans-serif (Helvetica)" },
  { value: "serif", label: "Serif (Times)" },
  { value: "mono", label: "Monospace (Courier)" },
];

const LAYOUT_PRESETS: { value: TemplateConfig["layout_preset"]; title: string; description: string }[] = [
  { value: "classic", title: "Classic", description: "White header, colored heading text, bottom border." },
  { value: "modern", title: "Modern", description: "Full-width colored header band with white text." },
  { value: "minimal", title: "Minimal", description: "No fills or borders, generous spacing, lightweight type." },
];

export default function DesignStudioPage() {
  const { activeBusiness } = useBusiness();
  const [topTab, setTopTab] = useState<"a4" | "thermal" | "barcode">("a4");

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-ink">Design Studio — {activeBusiness?.name}</h1>
        <div className="flex gap-2">
          <TabButton active={topTab === "a4"} onClick={() => setTopTab("a4")}>
            A4 Documents
          </TabButton>
          <TabButton active={topTab === "thermal"} onClick={() => setTopTab("thermal")}>
            Thermal Receipt
          </TabButton>
          <TabButton active={topTab === "barcode"} onClick={() => setTopTab("barcode")}>
            Barcode Labels
          </TabButton>
        </div>
      </div>

      {topTab === "a4" && <A4DocumentsTab />}
      {topTab === "thermal" && <ThermalTab />}
      {topTab === "barcode" && <PlaceholderPanel title="Barcode Labels" note="Not built yet — this is a placeholder tab, not a working design." />}
    </div>
  );
}

function A4DocumentsTab() {
  const [docType, setDocType] = useState<DocKind | "delivery_note">("invoice");

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <TabButton active={docType === "invoice"} onClick={() => setDocType("invoice")}>
          Invoice
        </TabButton>
        <TabButton active={docType === "quotation"} onClick={() => setDocType("quotation")}>
          Quotation
        </TabButton>
        <TabButton active={docType === "delivery_note"} onClick={() => setDocType("delivery_note")}>
          Delivery Note
        </TabButton>
      </div>

      {docType === "delivery_note" ? (
        <PlaceholderPanel title="Delivery Note" note="Not a document type this app generates — this is a labeled placeholder, not a faked design." />
      ) : (
        <A4ConfigEditor docType={docType} />
      )}
    </div>
  );
}

function PlaceholderPanel({ title, note }: { title: string; note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface p-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
        active ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-wash-1"
      }`}
    >
      {children}
    </button>
  );
}

/** Reads the "other" document type's already-saved config out of the raw
 * stored template_config JSON, so saving one doc type's tab never destroys
 * the other's. Handles both the new {invoice:{},quotation:{}} shape and a
 * pre-existing flat config (legacy — applied to both kinds). */
function otherDocConfig(business: Business, thisDocType: DocKind): Record<string, unknown> | undefined {
  const stored = business.template_config;
  if (!stored || typeof stored !== "object") return undefined;
  const otherKey: DocKind = thisDocType === "invoice" ? "quotation" : "invoice";
  const nested = stored[otherKey];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  if ("primary_color" in stored) return stored;
  return undefined;
}

function A4ConfigEditor({ docType }: { docType: DocKind }) {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [config, setConfig] = useState<TemplateConfig | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function loadConfig() {
    if (!activeBusiness) return;
    getDefaultTemplateConfig(docType).then((defaults) => {
      const stored = activeBusiness.template_config as Record<string, unknown> | null;
      const nested = stored && typeof stored[docType] === "object" ? (stored[docType] as Partial<TemplateConfig>) : null;
      const legacyFlat = stored && "primary_color" in stored ? (stored as unknown as Partial<TemplateConfig>) : null;
      setConfig({ ...defaults, ...(nested ?? legacyFlat ?? {}) });
    });
  }

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusiness?.id, docType]);

  useEffect(() => {
    if (!config) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchPreviewHtml(docType, config).then(setPreviewHtml);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, docType]);

  function set<K extends keyof TemplateConfig>(key: K, value: TemplateConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  }

  function toggleBillToField(key: string) {
    if (!config) return;
    const has = config.bill_to_fields.includes(key);
    set("bill_to_fields", has ? config.bill_to_fields.filter((f) => f !== key) : [...config.bill_to_fields, key]);
  }

  async function handleSave() {
    if (!activeBusiness || !config) return;
    setSaving(true);
    setMessage(null);
    try {
      const other = otherDocConfig(activeBusiness, docType);
      const merged = {
        invoice: docType === "invoice" ? config : other,
        quotation: docType === "quotation" ? config : other,
      };
      await updateBusiness(activeBusiness.id, { template_config: merged as unknown as Record<string, unknown> });
      await refreshBusinesses();
      setMessage(`Saved. This design now drives the live ${docType} PDF.`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setMessage(null);
    loadConfig();
  }

  if (!config) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-accent-green">{message}</span>}
          <button onClick={handleReset} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-wash-1">
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-5">
          <Section title="Layout Template">
            <div className="grid grid-cols-2 gap-2.5">
              {LAYOUT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => set("layout_preset", preset.value)}
                  className={`rounded-md border p-2 text-left ${
                    config.layout_preset === preset.value ? "border-accent bg-accent/5" : "border-line hover:bg-wash-1"
                  }`}
                >
                  <LayoutThumbnail preset={preset.value} primary={config.primary_color} accent={config.accent_color} />
                  <p className="mt-1.5 text-xs font-semibold text-ink">{preset.title}</p>
                  <p className="text-[11px] leading-snug text-muted">{preset.description}</p>
                </button>
              ))}
            </div>
          </Section>

          <Section title="Colors">
            <div>
              <span className="mb-1.5 block text-sm text-muted">Presets</span>
              <div className="grid grid-cols-4 gap-2">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    title={preset.name}
                    onClick={() => setConfig((c) => (c ? { ...c, primary_color: preset.primary, accent_color: preset.accent } : c))}
                    className={`h-8 w-8 rounded-full border-2 ${
                      config.primary_color === preset.primary && config.accent_color === preset.accent
                        ? "border-ink"
                        : "border-line"
                    }`}
                    style={{ background: `linear-gradient(135deg, ${preset.primary} 50%, ${preset.accent} 50%)` }}
                  />
                ))}
              </div>
            </div>
            <FieldRow label="Primary">
              <div className="flex items-center gap-2">
                <input type="color" value={config.primary_color} onChange={(e) => set("primary_color", e.target.value)} className="h-8 w-10 rounded border border-line bg-bg" />
                <span className="font-mono text-xs text-muted">{config.primary_color}</span>
              </div>
            </FieldRow>
            <FieldRow label="Accent">
              <div className="flex items-center gap-2">
                <input type="color" value={config.accent_color} onChange={(e) => set("accent_color", e.target.value)} className="h-8 w-10 rounded border border-line bg-bg" />
                <span className="font-mono text-xs text-muted">{config.accent_color}</span>
              </div>
            </FieldRow>
          </Section>

          <Section title="Typography">
            <FieldRow label="Font family">
              <select value={config.font_family} onChange={(e) => set("font_family", e.target.value as TemplateConfig["font_family"])} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none">
                {FONT_FAMILY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldRow>
            <FieldRow label="Font size">
              <select value={config.font_size} onChange={(e) => set("font_size", e.target.value as TemplateConfig["font_size"])} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none">
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </FieldRow>
            <FieldRow label="Table style">
              <select value={config.table_style} onChange={(e) => set("table_style", e.target.value as TemplateConfig["table_style"])} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none">
                <option value="simple">Simple</option>
                <option value="striped">Striped</option>
                <option value="bordered">Bordered</option>
              </select>
            </FieldRow>
            <FieldRow label="Margins">
              <select value={config.margins} onChange={(e) => set("margins", e.target.value as TemplateConfig["margins"])} className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none">
                <option value="narrow">Narrow</option>
                <option value="normal">Normal</option>
                <option value="wide">Wide</option>
              </select>
            </FieldRow>
          </Section>

          <Section title="Logo">
            <Checkbox label="Show logo" checked={config.logo_enabled} onChange={(v) => set("logo_enabled", v)} />
            <FieldRow label="Position">
              <select
                value={config.logo_position}
                onChange={(e) => set("logo_position", e.target.value as TemplateConfig["logo_position"])}
                disabled={!config.logo_enabled}
                className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </FieldRow>
          </Section>

          <Section title="Content Options">
            <Checkbox label="Sender block (From)" checked={config.show_sender_block} onChange={(v) => set("show_sender_block", v)} />
            <Checkbox label="Tax (VAT) breakdown" checked={config.show_tax_breakdown} onChange={(v) => set("show_tax_breakdown", v)} />
            <Checkbox label="Notes" checked={config.show_notes} onChange={(v) => set("show_notes", v)} />
            <Checkbox label="Terms & conditions" checked={config.show_terms} onChange={(v) => set("show_terms", v)} />
            <Checkbox label="Signature line" checked={config.show_signature} onChange={(v) => set("show_signature", v)} />
            <Checkbox label="Amount in words" checked={config.show_amount_in_words} onChange={(v) => set("show_amount_in_words", v)} />
          </Section>

          <Section title="Customer Details">
            {BILL_TO_FIELD_OPTIONS.map((opt) => (
              <Checkbox key={opt.key} label={opt.label} checked={config.bill_to_fields.includes(opt.key)} onChange={() => toggleBillToField(opt.key)} />
            ))}
          </Section>
        </div>

        <div className="col-span-2 rounded-lg border border-line bg-bg p-4">
          <p className="mb-2 text-xs font-medium uppercase text-muted">Live preview — {docType} (sample data)</p>
          <div className="overflow-hidden rounded-md border border-line bg-surface shadow-raised" style={{ aspectRatio: "1 / 1.3" }}>
            <iframe title="Document preview" srcDoc={previewHtml} className="h-full w-full" style={{ border: "none" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutThumbnail({ preset, primary, accent }: { preset: TemplateConfig["layout_preset"]; primary: string; accent: string }) {
  if (preset === "modern") {
    return (
      <div className="h-14 w-full overflow-hidden rounded border border-line bg-white">
        <div className="h-4 w-full" style={{ background: primary }} />
        <div className="mt-1.5 space-y-1 px-1.5">
          <div className="h-1 w-3/4 rounded-sm bg-slate-200" />
          <div className="h-1 w-1/2 rounded-sm bg-slate-200" />
        </div>
      </div>
    );
  }
  if (preset === "minimal") {
    return (
      <div className="h-14 w-full overflow-hidden rounded border border-line bg-white p-1.5">
        <div className="h-1 w-1/3 rounded-sm bg-slate-300" />
        <div className="mt-2.5 space-y-1.5">
          <div className="h-0.5 w-full bg-slate-100" />
          <div className="h-0.5 w-full bg-slate-100" />
        </div>
      </div>
    );
  }
  return (
    <div className="h-14 w-full overflow-hidden rounded border border-line bg-white p-1.5">
      <div className="flex items-center justify-between border-b-2 pb-1" style={{ borderColor: primary }}>
        <div className="h-1.5 w-1/3 rounded-sm bg-slate-300" />
        <div className="h-1.5 w-1/4 rounded-sm" style={{ background: accent }} />
      </div>
      <div className="mt-1.5 h-1 w-full rounded-sm bg-slate-200" />
    </div>
  );
}

const THERMAL_PREVIEW_PX_WIDTH: Record<58 | 80, number> = { 58: 240, 80: 320 };

function ThermalTab() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [config, setConfig] = useState<ThermalConfig | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewWidth, setPreviewWidth] = useState<58 | 80>(80);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    getDefaultThermalConfig().then((defaults) => {
      setConfig({ ...defaults, ...(activeBusiness.thermal_template_config as Partial<ThermalConfig> | null) });
    });
    setPreviewWidth(activeBusiness.thermal_paper_width === "58mm" ? 58 : 80);
  }, [activeBusiness?.id]);

  useEffect(() => {
    if (!config) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchThermalPreviewHtml(config, previewWidth).then(setPreviewHtml);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, previewWidth]);

  function set<K extends keyof ThermalConfig>(key: K, value: ThermalConfig[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  }

  async function handleSave() {
    if (!activeBusiness || !config) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateBusiness(activeBusiness.id, { thermal_template_config: config as unknown as Record<string, unknown> });
      await refreshBusinesses();
      setMessage("Saved. This design now drives the printed thermal receipt.");
    } finally {
      setSaving(false);
    }
  }

  if (!config) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-accent-green">{message}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-5">
          <Section title="Logo">
            <Checkbox label="Show logo" checked={config.logo_enabled} onChange={(v) => set("logo_enabled", v)} />
          </Section>

          <Section title="Text">
            <div>
              <span className="mb-1.5 block text-sm text-muted">Header text (under business name)</span>
              <input
                value={config.header_text}
                onChange={(e) => set("header_text", e.target.value)}
                className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm text-muted">Footer / thank-you text</span>
              <input
                value={config.footer_text}
                onChange={(e) => set("footer_text", e.target.value)}
                className="w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <FieldRow label="Font size">
              <select
                value={config.font_size}
                onChange={(e) => set("font_size", e.target.value as ThermalConfig["font_size"])}
                className="rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="small">Small</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </FieldRow>
          </Section>

          <Section title="Lines to show">
            <Checkbox label="Customer name" checked={config.show_customer_name} onChange={(v) => set("show_customer_name", v)} />
            <Checkbox label="Payment method" checked={config.show_payment_method} onChange={(v) => set("show_payment_method", v)} />
            <Checkbox label="VAT breakdown" checked={config.show_tax_breakdown} onChange={(v) => set("show_tax_breakdown", v)} />
            <Checkbox label='"Reprint / duplicate" notice' checked={config.show_reprint_notice} onChange={(v) => set("show_reprint_notice", v)} />
          </Section>
        </div>

        <div className="col-span-2 rounded-lg border border-line bg-bg p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase text-muted">Live preview (sample data)</p>
            <div className="flex gap-2">
              <TabButton active={previewWidth === 58} onClick={() => setPreviewWidth(58)}>
                58mm
              </TabButton>
              <TabButton active={previewWidth === 80} onClick={() => setPreviewWidth(80)}>
                80mm
              </TabButton>
            </div>
          </div>
          <div className="flex justify-center">
            <div
              className="overflow-hidden rounded-md border border-line bg-surface shadow-raised"
              style={{ width: THERMAL_PREVIEW_PX_WIDTH[previewWidth], height: 560 }}
            >
              <iframe title="Thermal receipt preview" srcDoc={previewHtml} className="h-full w-full" style={{ border: "none" }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-line" />
      {label}
    </label>
  );
}
