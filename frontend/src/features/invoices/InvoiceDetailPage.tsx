import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";

import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCustomer } from "../../api/customers";
import {
  fetchInvoicePdfBlob,
  fetchInvoicePreviewHtml,
  fetchInvoiceThermalPdfBlob,
  fetchInvoiceThermalPreviewHtml,
  getInvoice,
  recordPayment,
  updateInvoiceStatus,
} from "../../api/invoices";
import type { Customer, Invoice, InvoiceStatus, PaymentMethod } from "../../api/types";
import Modal from "../../components/Modal";
import PrintPreviewModal from "../../components/PrintPreviewModal";
import { Field, SaveButton, TextInput } from "../../components/form/Field";
import { useBusiness } from "../../context/BusinessContext";
import { currencyLabel } from "../../utils/currency";

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "sent", "paid", "partial", "void"];

const HEADING_FONT = { fontFamily: "'Space Grotesk', var(--font-sans)" };

const STATUS_PILL_STYLES: Record<InvoiceStatus, string> = {
  paid: "bg-accent-green/10 text-accent-green",
  partial: "bg-orange-50/10 text-orange-50",
  sent: "bg-info/10 text-info",
  draft: "bg-wash-2 text-muted",
  overdue: "bg-danger/10 text-danger",
  void: "bg-wash-2 text-muted line-through",
};

const CLEARED_PILL_STYLES: Record<string, string> = {
  received: "bg-accent-green/10 text-accent-green",
  pending: "bg-orange-50/10 text-orange-50",
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeBusiness } = useBusiness();
  const invoiceId = Number(id);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const inv = await getInvoice(invoiceId);
      setInvoice(inv);
      setCustomer(await getCustomer(inv.customer_id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function handleStatusChange(status: InvoiceStatus) {
    if (!invoice) return;
    const updated = await updateInvoiceStatus(invoice.id, status);
    setInvoice(updated);
  }

  if (loading || !invoice) return <p className="text-sm text-muted">Loading...</p>;

  const balanceDue = invoice.grand_total - invoice.amount_paid;
  const currency = currencyLabel(activeBusiness);

  return (
    <div style={{ fontFamily: "'Inter', var(--font-sans)" }}>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/invoices")} className="text-sm text-muted hover:text-ink hover:underline">
          ← Back to invoices
        </button>
        <div className="flex items-center gap-3">
          <select
            value={invoice.status}
            onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm capitalize focus:border-accent focus:outline-none"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {balanceDue > 0 && invoice.status !== "void" && (
            <button
              onClick={() => setShowPayment(true)}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-wash-1"
            >
              Record payment
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowPrintPreview(true)}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          >
            Print / Preview
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
        <div className="p-8">
          {/* Head */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-ink" style={HEADING_FONT}>
                  {invoice.number}
                </h1>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold capitalize ${STATUS_PILL_STYLES[invoice.status]}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {invoice.status}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-muted">
                Issued {invoice.invoice_date} · <span className="capitalize">{invoice.payment_method}</span>
                {activeBusiness && ` · ${activeBusiness.name}`}
              </p>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="mt-6 grid grid-cols-3 gap-3.5">
            <div className="rounded-xl bg-accent p-4 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">Grand total</p>
              <p className="mt-1.5 text-xl font-bold" style={HEADING_FONT}>
                <span className="mr-1 text-xs font-medium opacity-70">{currency}</span>
                {invoice.grand_total.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Amount paid</p>
              <p className="mt-1.5 text-xl font-bold text-accent-green" style={HEADING_FONT}>
                {invoice.amount_paid.toFixed(2)}
              </p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Balance due</p>
              <p className="mt-1.5 text-xl font-bold text-ink" style={HEADING_FONT}>
                {balanceDue.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Meta grid */}
          <div className="mt-7 grid grid-cols-2 gap-8 border-t border-line pt-6">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Billed to</p>
              <p className="text-[15px] font-semibold text-ink">{customer?.name ?? "—"}</p>
              {customer?.email && <p className="mt-0.5 text-sm text-muted">{customer.email}</p>}
              {customer?.phone && <p className="mt-0.5 text-sm text-muted">{customer.phone_code} {customer.phone}</p>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Invoice no.</dt>
              <dd className="text-right font-semibold text-ink">{invoice.number}</dd>
              <dt className="text-muted">Invoice date</dt>
              <dd className="text-right font-semibold text-ink">{invoice.invoice_date}</dd>
              <dt className="text-muted">Payment method</dt>
              <dd className="text-right font-semibold capitalize text-ink">{invoice.payment_method}</dd>
              <dt className="text-muted">Status</dt>
              <dd className="text-right font-semibold capitalize text-ink">{invoice.status}</dd>
            </dl>
          </div>

          {/* Items */}
          <h3 className="mt-8 text-[11px] font-semibold uppercase tracking-wide text-muted">Items</h3>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2.5">Description</th>
                <th className="pb-2.5 text-right">Qty</th>
                <th className="pb-2.5 text-right">Price</th>
                <th className="pb-2.5 text-right">Discount</th>
                <th className="pb-2.5 text-right">Govt. fee</th>
                <th className="pb-2.5 text-right">VAT %</th>
                <th className="pb-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3.5 font-semibold text-ink">{item.description}</td>
                  <td className="py-3.5 text-right text-muted">{item.qty}</td>
                  <td className="py-3.5 text-right text-muted">{item.unit_price.toFixed(2)}</td>
                  <td className="py-3.5 text-right text-muted">{item.discount.toFixed(2)}</td>
                  <td className="py-3.5 text-right text-muted">{item.govt_fee.toFixed(2)}</td>
                  <td className="py-3.5 text-right text-muted">{item.vat_rate.toFixed(2)}%</td>
                  <td className="py-3.5 text-right font-semibold text-ink">{item.line_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-5 flex justify-end">
            <div className="w-full max-w-xs text-sm">
              <Row label="Subtotal" value={invoice.subtotal} />
              <Row label="Discount" value={-invoice.discount_total} />
              <Row label="VAT" value={invoice.vat_total} />
              <Row label="Govt. fees" value={invoice.govt_fee_total} />
              <div className="my-3 flex items-center justify-between rounded-lg bg-accent px-4 py-3 text-white">
                <span className="text-sm opacity-85">Grand total</span>
                <span className="text-xl font-bold" style={HEADING_FONT}>
                  <span className="mr-1 text-xs font-medium opacity-70">{currency}</span>
                  {invoice.grand_total.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 text-accent-green">
                <span>Paid</span>
                <span className="font-semibold">{invoice.amount_paid.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-line pt-2.5 font-bold text-ink">
                <span>Balance due</span>
                <span>{balanceDue.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="mt-8 rounded-r-md border-l-[3px] border-accent bg-accent/5 p-4">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">Notes</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{invoice.notes}</p>
            </div>
          )}
          {invoice.terms && (
            <div className="mt-3 rounded-r-md border-l-[3px] border-line bg-wash-1 p-4">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Terms</h4>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{invoice.terms}</p>
            </div>
          )}

          {/* Payments */}
          {invoice.payments.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Payments</h3>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-muted">
                    <th className="pb-1.5">Date</th>
                    <th className="pb-1.5">Method</th>
                    <th className="pb-1.5">Cleared</th>
                    <th className="pb-1.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-3 text-muted">{p.paid_on}</td>
                      <td className="py-3">
                        <span className="inline-block rounded-md bg-wash-1 px-2.5 py-0.5 text-xs font-semibold capitalize text-muted">
                          {p.payment_method}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-block rounded-md px-2.5 py-0.5 text-xs font-semibold capitalize ${CLEARED_PILL_STYLES[p.cleared_status]}`}>
                          {p.cleared_status}
                        </span>
                      </td>
                      <td className="py-3 text-right text-muted">{p.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-bold text-ink">
                    <td className="pt-3" colSpan={3}>
                      Total paid
                    </td>
                    <td className="pt-3 text-right">{invoice.amount_paid.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {showPayment && (
        <RecordPaymentModal
          invoiceId={invoice.id}
          maxAmount={balanceDue}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            load();
          }}
        />
      )}

      {showPrintPreview && (
        <PrintPreviewModal
          title={`Print Preview - ${invoice.number}`}
          filenameBase={invoice.number}
          onClose={() => setShowPrintPreview(false)}
          fetchPreviewHtml={(format, width) =>
            format === "a4" ? fetchInvoicePreviewHtml(invoice.id) : fetchInvoiceThermalPreviewHtml(invoice.id, width)
          }
          fetchPdfBlob={(format, width) =>
            format === "a4" ? fetchInvoicePdfBlob(invoice.id) : fetchInvoiceThermalPdfBlob(invoice.id, width)
          }
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between py-1 text-muted">
      <span>{label}</span>
      <span className="text-ink">{value.toFixed(2)}</span>
    </div>
  );
}

// method (free text, kept for the existing invoice PDF/reporting) is derived
// from the reconciliation-relevant payment_method the user actually picks
// here, mirroring the same cash/card/else->online bucketing the Part 1
// migration used for historical data.
const METHOD_OPTIONS: { value: PaymentMethod; label: string; detail: string }[] = [
  { value: "cash", label: "Cash", detail: "cash" },
  { value: "card", label: "Card", detail: "card" },
  { value: "online", label: "Online / bank transfer", detail: "bank_transfer" },
];

function RecordPaymentModal({
  invoiceId,
  maxAmount,
  onClose,
  onSaved,
}: {
  invoiceId: number;
  maxAmount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(maxAmount.toFixed(2)));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const detail = METHOD_OPTIONS.find((m) => m.value === paymentMethod)?.detail ?? "cash";
      await recordPayment(invoiceId, {
        amount: Number(amount),
        method: detail,
        paid_on: paidOn,
        reference: reference || null,
        payment_method: paymentMethod,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Amount">
          <TextInput type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Payment method">
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            {METHOD_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Paid on">
          <TextInput type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
        </Field>
        <Field label="Reference (optional)">
          <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-muted hover:bg-wash-2">
            Cancel
          </button>
          <SaveButton saving={saving} label="Record payment" />
        </div>
      </form>
    </Modal>
  );
}
