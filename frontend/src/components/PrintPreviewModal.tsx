import { useEffect, useState } from "react";
import { useBusiness } from "../context/BusinessContext";
import { downloadBlob } from "../platform/download";
import { printPdfBlob } from "../platform/print";

type Format = "a4" | "thermal";
type ThermalWidth = 58 | 80;

export interface PrintPreviewModalProps {
  title: string;
  filenameBase: string;
  onClose: () => void;
  fetchPreviewHtml: (format: Format, thermalWidth: ThermalWidth) => Promise<string>;
  fetchPdfBlob: (format: Format, thermalWidth: ThermalWidth) => Promise<Blob>;
}

/**
 * The single in-app "Print Preview" surface for invoices/quotations — an
 * overlay modal, not a browser tab/window, so it behaves the same way once
 * this app is wrapped in Tauri. A4 and Thermal share this one component via
 * a format toggle; both Download and Print go through the platform/
 * abstractions so a later Tauri swap only touches those two files.
 */
export default function PrintPreviewModal({
  title,
  filenameBase,
  onClose,
  fetchPreviewHtml,
  fetchPdfBlob,
}: PrintPreviewModalProps) {
  const { activeBusiness } = useBusiness();
  const [format, setFormat] = useState<Format>("a4");
  const [thermalWidth, setThermalWidth] = useState<ThermalWidth>(activeBusiness?.thermal_paper_width === "58mm" ? 58 : 80);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"print" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPreviewHtml(format, thermalWidth)
      .then((h) => {
        if (!cancelled) setHtml(h);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the preview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [format, thermalWidth, fetchPreviewHtml]);

  async function handleDownload() {
    setError(null);
    setBusy("download");
    try {
      const blob = await fetchPdfBlob(format, thermalWidth);
      const suffix = format === "thermal" ? "-thermal" : "";
      downloadBlob(blob, `${filenameBase}${suffix}.pdf`);
    } catch {
      setError("Could not generate the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setError(null);
    setBusy("print");
    try {
      const blob = await fetchPdfBlob(format, thermalWidth);
      await printPdfBlob(blob);
    } catch {
      setError("Could not generate the PDF.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-surface shadow-overlay">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <p className="text-xs text-muted">Review before printing or downloading</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <FormatButton active={format === "a4"} onClick={() => setFormat("a4")}>
                A4
              </FormatButton>
              <FormatButton active={format === "thermal"} onClick={() => setFormat("thermal")}>
                Thermal
              </FormatButton>
            </div>
            {format === "thermal" && (
              <div className="flex gap-1.5">
                <FormatButton active={thermalWidth === 58} onClick={() => setThermalWidth(58)}>
                  58mm
                </FormatButton>
                <FormatButton active={thermalWidth === 80} onClick={() => setThermalWidth(80)}>
                  80mm
                </FormatButton>
              </div>
            )}
            <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-bg p-6">
          {loading ? (
            <p className="text-center text-sm text-muted">Loading preview...</p>
          ) : (
            <div className="flex justify-center">
              <div
                className="overflow-hidden rounded-md border border-line bg-surface shadow-raised"
                style={format === "thermal" ? { width: thermalWidth === 58 ? 240 : 320, height: 700 } : { width: "100%", maxWidth: 720, aspectRatio: "1 / 1.35" }}
              >
                <iframe title="Document preview" srcDoc={html} className="h-full w-full" style={{ border: "none" }} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          {error ? <span className="text-sm text-danger">{error}</span> : <span />}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDownload}
              disabled={busy !== null}
              className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-wash-1 disabled:opacity-50"
            >
              {busy === "download" ? "Preparing..." : "Download PDF"}
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={busy !== null}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy === "print" ? "Preparing..." : "Print"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
