import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getCustomer } from "../../api/customers";
import {
  fetchInvoicePdfBlob,
  fetchInvoicePreviewBlob,
  getInvoice,
  recordPayment,
  updateInvoiceStatus,
} from "../../api/invoices";
import type { Customer, Invoice, InvoiceStatus } from "../../api/types";
import Modal from "../../components/Modal";
import { Field, SaveButton, TextInput } from "../../components/form/Field";
import { openBlobDocument } from "../../utils/openBlobDocument";

const STATUS_OPTIONS: InvoiceStatus[] = ["draft", "sent", "paid", "partial", "void"];

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const invoiceId = Number(id);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

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

  async function handlePreview() {
    setDocError(null);
    try {
      await openBlobDocument(() => fetchInvoicePreviewBlob(invoice!.id), `${invoice!.number}-preview.html`);
    } catch {
      setDocError("Could not load the preview.");
    }
  }

  async function handlePdf() {
    setDocError(null);
    try {
      await openBlobDocument(() => fetchInvoicePdfBlob(invoice!.id), `${invoice!.number}.pdf`);
    } catch {
      setDocError("Could not generate the PDF.");
    }
  }

  return (
    <div>
      <button onClick={() => navigate("/invoices")} className="mb-3 text-sm text-muted hover:underline">
        ← Back to invoices
      </button>

      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-ink">{invoice.number}</h1>
            <p className="text-sm text-muted">
              {customer?.name} · {invoice.invoice_date} · <span className="capitalize">{invoice.transaction_type}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={invoice.status}
              onChange={(e) => handleStatusChange(e.target.value as InvoiceStatus)}
              className="rounded-md border border-line px-3 py-1.5 text-sm capitalize focus:border-accent focus:outline-none"
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
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Record payment
              </button>
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
            {invoice.items.map((item) => (
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
          <Row label="Subtotal" value={invoice.subtotal} />
          <Row label="Discount" value={-invoice.discount_total} />
          <Row label="VAT" value={invoice.vat_total} />
          <Row label="Govt. fees" value={invoice.govt_fee_total} />
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold text-ink">
            <span>Grand total</span>
            <span>{invoice.grand_total.toFixed(2)}</span>
          </div>
          <Row label="Paid" value={invoice.amount_paid} />
          <div className="flex justify-between font-medium text-muted">
            <span>Balance due</span>
            <span>{balanceDue.toFixed(2)}</span>
          </div>
        </div>

        {invoice.payments.length > 0 && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-ink">Payments</h2>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line">
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 text-muted">{p.paid_on}</td>
                    <td className="py-1.5 capitalize text-muted">{p.method}</td>
                    <td className="py-1.5 text-muted">{p.reference}</td>
                    <td className="py-1.5 text-right text-muted">{p.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(invoice.notes || invoice.terms) && (
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {invoice.notes && (
              <div>
                <p className="text-xs font-medium uppercase text-muted">Notes</p>
                <p className="whitespace-pre-wrap text-muted">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <p className="text-xs font-medium uppercase text-muted">Terms</p>
                <p className="whitespace-pre-wrap text-muted">{invoice.terms}</p>
              </div>
            )}
          </div>
        )}
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
  const [method, setMethod] = useState("cash");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await recordPayment(invoiceId, { amount: Number(amount), method, paid_on: paidOn, reference: reference || null });
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
        <Field label="Method">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="other">Other</option>
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
