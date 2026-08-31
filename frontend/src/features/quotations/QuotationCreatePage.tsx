import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCustomers, listEmployees } from "../../api/customers";
import type { InvoiceItemPayload } from "../../api/invoices";
import { createQuotation } from "../../api/quotations";
import type { Customer } from "../../api/types";
import { TextArea, TextInput } from "../../components/form/Field";
import SearchCombobox from "../../components/SearchCombobox";
import { useBusiness } from "../../context/BusinessContext";
import CustomerFormModal from "../customers/CustomerFormModal";
import LineItemRow, { emptyLine, type LineItemState } from "../invoices/LineItemRow";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function QuotationCreatePage() {
  const { activeBusiness } = useBusiness();
  const navigate = useNavigate();
  const defaultVat = activeBusiness?.default_vat_rate ?? 0;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [employees, setEmployees] = useState<Customer[]>([]);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [quotationDate, setQuotationDate] = useState(today());
  const [validityDays, setValidityDays] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [couponCode, setCouponCode] = useState("");

  const [lines, setLines] = useState<LineItemState[]>([emptyLine(defaultVat)]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    setNotes(activeBusiness.default_quotation_notes ?? "");
    setTerms(activeBusiness.default_quotation_terms ?? "");
    setValidityDays(String(activeBusiness.default_quotation_validity_days));
  }, [activeBusiness]);

  useEffect(() => {
    if (customer?.type === "company") {
      listEmployees(customer.id).then(setEmployees);
    } else {
      setEmployees([]);
      setEmployeeId("");
    }
  }, [customer]);

  const fetchCustomers = useCallback(async (query: string) => {
    const res = await listCustomers({ search: query || undefined, include_employees: false, page: 1, page_size: 15 });
    return res.items;
  }, []);

  function updateLine(index: number, updated: LineItemState) {
    setLines((prev) => prev.map((l, i) => (i === index ? updated : l)));
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const subtotal = lines.reduce((sum, l) => sum + Math.max(l.qty * l.unit_price - l.discount, 0), 0);
  const vatTotal = lines.reduce((sum, l) => sum + Math.max(l.qty * l.unit_price - l.discount, 0) * (l.vat_rate / 100), 0);
  const govtFeeTotal = lines.reduce((sum, l) => sum + l.govt_fee * l.qty, 0);
  const grandTotalPreview = subtotal + vatTotal + govtFeeTotal;

  async function handleSubmit() {
    if (!customer) {
      setError("Select a customer first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const items: InvoiceItemPayload[] = lines.map((l) => ({
        service_id: l.service_id,
        description: l.description,
        qty: l.qty,
        unit_price: l.unit_price,
        govt_fee: l.govt_fee,
        discount: l.discount,
        vat_rate: l.vat_rate,
        save_as_service: l.save_as_service,
      }));
      const quotation = await createQuotation({
        customer_id: customer.id,
        employee_customer_id: employeeId || null,
        quotation_date: quotationDate,
        validity_days: validityDays ? Number(validityDays) : null,
        notes,
        terms,
        show_bank_details: showBankDetails,
        coupon_code: couponCode || null,
        items,
      });
      navigate(`/quotations/${quotation.id}`);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || "Could not create quotation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink">New Quotation</h1>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-3">
              <span className="mb-1 block text-sm font-medium text-muted">Customer</span>
              {customer ? (
                <div className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                  <span>
                    {customer.name} <span className="text-xs text-muted capitalize">({customer.type})</span>
                  </span>
                  <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted hover:text-muted">
                    change
                  </button>
                </div>
              ) : (
                <SearchCombobox<Customer>
                  placeholder="Search customers..."
                  fetchOptions={fetchCustomers}
                  getLabel={(c) => c.name}
                  getSubLabel={(c) => c.phone}
                  onSelect={setCustomer}
                  extraOption={{ label: "+ New / Other customer", onClick: () => setShowCustomerModal(true) }}
                />
              )}
            </div>

            {customer?.type === "company" && (
              <div className="mb-3">
                <span className="mb-1 block text-sm font-medium text-muted">Employee (optional)</span>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                >
                  <option value="">— none —</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Quotation date</span>
                <TextInput type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Validity (days)</span>
                <TextInput type="number" min="1" value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Line items</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="px-2 py-1">Service / description</th>
                  <th className="px-2 py-1">Qty</th>
                  <th className="px-2 py-1">Price</th>
                  <th className="px-2 py-1">Govt fee</th>
                  <th className="px-2 py-1">Discount</th>
                  <th className="px-2 py-1">VAT %</th>
                  <th className="px-2 py-1 text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <LineItemRow
                    key={line.key}
                    line={line}
                    defaultVat={defaultVat}
                    onChange={(updated) => updateLine(i, updated)}
                    onRemove={() => removeLine(i)}
                  />
                ))}
              </tbody>
            </table>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine(defaultVat)])}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              + Add line
            </button>
          </div>

          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Notes</span>
                <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">Terms</span>
                <TextArea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
              </label>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showBankDetails} onChange={(e) => setShowBankDetails(e.target.checked)} />
              Include bank details on quotation
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">Coupon</h2>
            <TextInput value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Coupon code (optional)" />
          </div>

          <div className="rounded-lg border border-line bg-surface p-4 text-sm">
            <h2 className="mb-3 font-semibold text-ink">Totals (preview)</h2>
            <div className="space-y-1 text-muted">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>VAT</span>
                <span>{vatTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Govt. fees</span>
                <span>{govtFeeTotal.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted">Coupon discount is applied when you save.</p>
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <span>Grand total</span>
                <span>{grandTotalPreview.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create quotation"}
          </button>
        </div>
      </div>

      {showCustomerModal && (
        <CustomerFormModal
          onClose={() => setShowCustomerModal(false)}
          onSaved={(c) => {
            setCustomer(c);
            setShowCustomerModal(false);
          }}
        />
      )}
    </div>
  );
}
