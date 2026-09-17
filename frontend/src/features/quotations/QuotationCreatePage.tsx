import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCustomers, listEmployees } from "../../api/customers";
import type { InvoiceItemPayload } from "../../api/invoices";
import { createQuotation } from "../../api/quotations";
import type { Customer } from "../../api/types";
import { TextArea, TextInput, Toggle } from "../../components/form/Field";
import SearchCombobox from "../../components/SearchCombobox";
import { useBusiness } from "../../context/BusinessContext";
import { useFeatureFlags } from "../../context/FeatureFlagsContext";
import CustomerFormModal from "../customers/CustomerFormModal";
import LineItemRow, { emptyLine, lineNet, num, type LineItemState } from "../invoices/LineItemRow";
import { getErrorMessage } from "../../utils/errors";
import { advanceOnEnter } from "../../utils/formNavigation";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function QuotationCreatePage() {
  const { activeBusiness } = useBusiness();
  const { isEnabled } = useFeatureFlags();
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
    if (customer) setError(null);
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

  const subtotal = lines.reduce((sum, l) => sum + lineNet(l), 0);
  const vatTotal = lines.reduce((sum, l) => sum + lineNet(l) * (num(l.vat_rate) / 100), 0);
  const govtFeeTotal = lines.reduce((sum, l) => sum + num(l.govt_fee) * num(l.qty), 0);
  const bankFeeTotal = lines.reduce((sum, l) => sum + num(l.bank_fee) * num(l.qty), 0);
  const edrhFeeTotal = lines.reduce((sum, l) => sum + num(l.edrh_fee) * num(l.qty), 0);
  const grandTotalPreview = subtotal + vatTotal + govtFeeTotal + bankFeeTotal + edrhFeeTotal;
  const showFeeBreakdown = activeBusiness?.custom_invoice_template === "hassas";
  const [autoReferences, setAutoReferences] = useState(false);

  async function handleSubmit() {
    if (!customer) {
      setError("Select a customer first.");
      return;
    }
    if (lines.some((l) => !l.description || l.qty === "" || l.unit_price === "" || l.unit_price < 0)) {
      setError("Every line needs a description, a quantity, and a valid price.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const items: InvoiceItemPayload[] = lines.map((l) => ({
        service_id: l.service_id,
        description: l.description,
        qty: num(l.qty),
        unit_price: num(l.unit_price),
        govt_fee: num(l.govt_fee),
        bank_fee: num(l.bank_fee),
        edrh_fee: num(l.edrh_fee),
        trans_no: showFeeBreakdown && autoReferences ? null : l.trans_no || null,
        inv_no: showFeeBreakdown && autoReferences ? null : l.inv_no || null,
        discount_pct: num(l.discount_pct),
        vat_rate: num(l.vat_rate),
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
        auto_reference_numbers: showFeeBreakdown && autoReferences,
        items,
      });
      navigate(`/quotations/${quotation.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not create quotation."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink">New Quotation</h1>

      {/* onKeyDown, not a <form>: Enter walks to the next field rather than
          submitting, so creating the quotation stays an explicit click. */}
      <div className="grid grid-cols-3 gap-6" onKeyDown={advanceOnEnter}>
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
            <div className="mb-2 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-ink">Service Items</h2>
              {showFeeBreakdown && (
                <Toggle
                  checked={autoReferences}
                  onChange={setAutoReferences}
                  label="Auto Trans No. & Inv No. (Inv No. = quotation number)"
                />
              )}
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm" style={showFeeBreakdown ? { minWidth: 900 } : undefined}>
              <thead className="text-left text-xs font-semibold uppercase text-muted">
                <tr>
                  <th className="px-2 py-1">{showFeeBreakdown ? "Site name" : "Service / description"}</th>
                  <th className="px-2 py-1">Qty</th>
                  {showFeeBreakdown && (
                    <>
                      <th className="px-2 py-1">Trans No.</th>
                      <th className="px-2 py-1">Inv No.</th>
                    </>
                  )}
                  {!showFeeBreakdown && <th className="px-2 py-1">Price</th>}
                  <th className="px-2 py-1">Govt fee</th>
                  {showFeeBreakdown && (
                    <>
                      <th className="px-2 py-1">Bank fee</th>
                      <th className="px-2 py-1">Type fee</th>
                    </>
                  )}
                  {showFeeBreakdown && <th className="px-2 py-1">E-Drh fee</th>}
                  <th className="px-2 py-1">Discount %</th>
                  <th className="px-2 py-1">VAT %</th>
                  <th className="px-2 py-1 text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <LineItemRow
                    key={line.key}
                    line={line}
                    defaultVat={defaultVat}
                    showFeeBreakdown={showFeeBreakdown}
                    autoReferences={showFeeBreakdown && autoReferences}
                    onChange={(updated) => updateLine(i, updated)}
                    onRemove={() => removeLine(i)}
                  />
                ))}
              </tbody>
            </table>
            </div>
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine(defaultVat)])}
              className="mt-3 text-sm font-medium text-link hover:underline"
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
            <div className="mt-3">
              <Toggle checked={showBankDetails} onChange={setShowBankDetails} label="Include bank details on quotation" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {isEnabled("coupons") && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">Coupon</h2>
              <TextInput value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} placeholder="Coupon code (optional)" />
            </div>
          )}

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
              {showFeeBreakdown && (
                <>
                  <div className="flex justify-between">
                    <span>Bank fees</span>
                    <span>{bankFeeTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>E-Drh fees</span>
                    <span>{edrhFeeTotal.toFixed(2)}</span>
                  </div>
                </>
              )}
              {isEnabled("coupons") && <p className="text-xs text-muted">Coupon discount is applied when you save.</p>}
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
            className="w-full rounded-md bg-accent px-4 py-3 text-sm font-medium text-ink hover:opacity-90 transition-opacity disabled:opacity-50"
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
