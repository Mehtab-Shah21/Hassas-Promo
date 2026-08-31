import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCustomer } from "../../api/customers";
import {
  convertQuotation,
  fetchQuotationPdfBlob,
  fetchQuotationPreviewBlob,
  fetchQuotationThermalPdfBlob,
  getQuotation,
  updateQuotationStatus,
} from "../../api/quotations";
import type { Customer, Quotation, QuotationStatus, TransactionType } from "../../api/types";
import { openBlobDocument } from "../../utils/openBlobDocument";

const STATUS_OPTIONS: QuotationStatus[] = ["draft", "sent", "accepted", "rejected"];

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const quotationId = Number(id);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [convertType, setConvertType] = useState<TransactionType>("credit");
  const [docError, setDocError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const q = await getQuotation(quotationId);
      setQuotation(q);
      setCustomer(await getCustomer(q.customer_id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotationId]);

  async function handleStatusChange(status: QuotationStatus) {
    if (!quotation) return;
    setQuotation(await updateQuotationStatus(quotation.id, status));
  }

  async function handleConvert() {
    if (!quotation) return;
    setConverting(true);
    try {
      const result = await convertQuotation(quotation.id, convertType);
      navigate(`/invoices/${result.invoice_id}`);
    } finally {
      setConverting(false);
    }
  }

  if (loading || !quotation) return <p className="text-sm text-muted">Loading...</p>;

  async function handlePreview() {
    setDocError(null);
    try {
      await openBlobDocument(() => fetchQuotationPreviewBlob(quotation!.id), `${quotation!.number}-preview.html`);
    } catch {
      setDocError("Could not load the preview.");
    }
  }

  async function handlePdf() {
    setDocError(null);
    try {
      await openBlobDocument(() => fetchQuotationPdfBlob(quotation!.id), `${quotation!.number}.pdf`);
    } catch {
      setDocError("Could not generate the PDF.");
    }
  }

  async function handleThermalPdf() {
    setDocError(null);
    try {
      await openBlobDocument(() => fetchQuotationThermalPdfBlob(quotation!.id), `${quotation!.number}-thermal.pdf`);
    } catch {
      setDocError("Could not generate the thermal receipt.");
    }
  }

  return (
    <div>
      <button onClick={() => navigate("/quotations")} className="mb-3 text-sm text-muted hover:underline">
        ← Back to quotations
      </button>

      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{quotation.number}</h1>
            <p className="text-sm text-muted">
              {customer?.name} · {quotation.quotation_date} · valid until {quotation.valid_until}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {quotation.status === "converted" ? (
              <span className="rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
                Converted → Invoice #{quotation.converted_invoice_id}
              </span>
            ) : (
              <>
                <select
                  value={quotation.status}
                  onChange={(e) => handleStatusChange(e.target.value as QuotationStatus)}
                  className="rounded-md border border-line px-3 py-1.5 text-sm capitalize focus:border-accent focus:outline-none"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={convertType}
                  onChange={(e) => setConvertType(e.target.value as TransactionType)}
                  className="rounded-md border border-line px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="credit">Credit</option>
                  <option value="cash">Cash</option>
                </select>
                <button
                  onClick={handleConvert}
                  disabled={converting}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {converting ? "Converting..." : "Convert to invoice"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handlePreview}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handlePdf}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={handleThermalPdf}
              title="Uses this business's Settings paper width and Design Studio thermal design"
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1"
            >
              Thermal receipt
            </button>
          </div>
        </div>

        {docError && <p className="mb-4 text-sm text-danger">{docError}</p>}

        <table className="mb-4 w-full text-sm">
          <thead className="text-left text-xs font-semibold uppercase text-muted">
            <tr>
              <th className="py-1.5">Description</th>
              <th className="py-1.5">Qty</th>
              <th className="py-1.5">Price</th>
              <th className="py-1.5">Discount</th>
              <th className="py-1.5">VAT %</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {quotation.items.map((item) => (
              <tr key={item.id}>
                <td className="py-2 text-ink">{item.description}</td>
                <td className="py-2 text-muted">{item.qty}</td>
                <td className="py-2 text-muted">{item.unit_price.toFixed(2)}</td>
                <td className="py-2 text-muted">{item.discount.toFixed(2)}</td>
                <td className="py-2 text-muted">{item.vat_rate.toFixed(2)}</td>
                <td className="py-2 text-right text-muted">{item.line_total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={quotation.subtotal} />
          <Row label="Discount" value={-quotation.discount_total} />
          <Row label="VAT" value={quotation.vat_total} />
          <Row label="Govt. fees" value={quotation.govt_fee_total} />
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold text-ink">
            <span>Grand total</span>
            <span>{quotation.grand_total.toFixed(2)}</span>
          </div>
        </div>

        {(quotation.notes || quotation.terms) && (
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {quotation.notes && (
              <div>
                <p className="text-xs font-medium uppercase text-muted">Notes</p>
                <p className="whitespace-pre-wrap text-muted">{quotation.notes}</p>
              </div>
            )}
            {quotation.terms && (
              <div>
                <p className="text-xs font-medium uppercase text-muted">Terms</p>
                <p className="whitespace-pre-wrap text-muted">{quotation.terms}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
  );
}
