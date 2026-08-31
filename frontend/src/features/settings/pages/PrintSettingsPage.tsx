import { useEffect, useState, type FormEvent } from "react";
import { updateBusiness } from "../../../api/businesses";
import { useBusiness } from "../../../context/BusinessContext";
import { SaveButton } from "../../../components/form/Field";

const PAPER_WIDTH_OPTIONS: { value: string; label: string }[] = [
  { value: "58mm", label: "58mm" },
  { value: "80mm", label: "80mm" },
];

export default function PrintSettingsPage() {
  const { activeBusiness, refreshBusinesses } = useBusiness();
  const [thermalPaperWidth, setThermalPaperWidth] = useState("80mm");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setThermalPaperWidth(activeBusiness.thermal_paper_width);
  }, [activeBusiness]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeBusiness) return;
    setSaving(true);
    setMessage(null);
    try {
      await updateBusiness(activeBusiness.id, { thermal_paper_width: thermalPaperWidth });
      await refreshBusinesses();
      setMessage("Saved.");
    } finally {
      setSaving(false);
    }
  }

  if (!activeBusiness) return <p className="text-sm text-muted">Loading...</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Print & Paper — {activeBusiness.name}</h2>
        <p className="text-sm text-muted">
          Hardware/printer settings. This is which thermal receipt roll is loaded in this
          business's printer — the receipt's design (logo, text, which lines show) is set
          separately in Design Studio's Thermal Receipt tab.
        </p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-muted">Thermal paper width</span>
        <div className="flex gap-2">
          {PAPER_WIDTH_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setThermalPaperWidth(opt.value)}
              className={`rounded-md border px-4 py-2 text-sm font-medium ${
                thermalPaperWidth === opt.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:bg-wash-1"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SaveButton saving={saving} />
        {message && <span className="text-sm text-accent-green">{message}</span>}
      </div>
    </form>
  );
}
