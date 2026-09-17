import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FileText, Tag, Ticket, User, Wallet } from "lucide-react";
import { listCoupons } from "../../api/coupons";
import { resolveAssetUrl } from "../../api/client";
import { listCustomers, listEmployees } from "../../api/customers";
import { createInvoice, type InvoiceItemPayload } from "../../api/invoices";
import type { Coupon, Customer, PaymentMethod } from "../../api/types";
import { Field, RadioGroup, Select, TextArea, TextInput, Toggle } from "../../components/form/Field";
import SearchCombobox from "../../components/SearchCombobox";
import { useBusiness } from "../../context/BusinessContext";
import { useFeatureFlags } from "../../context/FeatureFlagsContext";
import CustomerFormModal from "../customers/CustomerFormModal";
import LineItemRow, { emptyLine, lineNet, num, type LineItemState } from "./LineItemRow";
import { getErrorMessage } from "../../utils/errors";
import { advanceOnEnter } from "../../utils/formNavigation";

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function InvoiceCreatePage() {
  const { activeBusiness } = useBusiness();
  const { isEnabled } = useFeatureFlags();
  const navigate = useNavigate();
  const defaultVat = activeBusiness?.default_vat_rate ?? 0;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [employees, setEmployees] = useState<Customer[]>([]);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [invoiceDate, setInvoiceDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  // A printed-banner coupon, chosen independently of the discount coupon —
  // an invoice can carry one, the other, or both.
  const [bannerCode, setBannerCode] = useState("");

  const [lines, setLines] = useState<LineItemState[]>([emptyLine(defaultVat)]);

  const couponsEnabled = isEnabled("coupons");
  useEffect(() => {
    if (!couponsEnabled) {
      setCoupons([]);
      setCouponCode("");
      setBannerCode("");
      return;
    }
    // active_only already drops inactive coupons and ones outside their
    // valid-from/to window. A coupon that has hit max_uses is normally
    // deactivated by the backend on its last use, but filter it here too so
    // the list never offers one the server would reject on save.
    listCoupons(true)
      .then((list) => {
        const usable = list.filter((c) => c.max_uses === null || c.times_used < c.max_uses);
        setCoupons(usable);
        // Coupons are per business: drop a selection that doesn't exist in
        // the newly active business's list.
        setCouponCode((code) => (usable.some((c) => c.code === code && c.kind === "discount") ? code : ""));
        setBannerCode((code) => (usable.some((c) => c.code === code && c.kind === "banner") ? code : ""));
      })
      .catch(() => setCoupons([]));
  }, [couponsEnabled, activeBusiness?.id]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeBusiness) return;
    // The business's two default note/term sets predate payment methods
    // (cash vs. credit); cash keeps the "cash" set, card/online use the
    // other set, same as credit did.
    setNotes(paymentMethod === "cash" ? activeBusiness.default_invoice_notes_cash ?? "" : activeBusiness.default_invoice_notes_credit ?? "");
    setTerms(paymentMethod === "cash" ? activeBusiness.default_invoice_terms_cash ?? "" : activeBusiness.default_invoice_terms_credit ?? "");
  }, [paymentMethod, activeBusiness]);

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

  const showFeeBreakdown = activeBusiness?.custom_invoice_template === "hassas";
  const [autoReferences, setAutoReferences] = useState(false);

  const subtotal = lines.reduce((sum, l) => sum + lineNet(l), 0);
  const vatTotal = lines.reduce((sum, l) => sum + lineNet(l) * (num(l.vat_rate) / 100), 0);
  const govtFeeTotal = lines.reduce((sum, l) => sum + num(l.govt_fee) * num(l.qty), 0);
  const bankFeeTotal = lines.reduce((sum, l) => sum + num(l.bank_fee) * num(l.qty), 0);
  const edrhFeeTotal = lines.reduce((sum, l) => sum + num(l.edrh_fee) * num(l.qty), 0);
  // Picking from a list means the coupon is known up front, so its discount
  // can be previewed instead of only appearing after save. Mirrors
  // calc_invoice_totals on the backend: percent of the subtotal or a fixed
  // amount, never more than the subtotal, taken off before VAT and fees are
  // added back.
  const discountCoupons = coupons.filter((c) => c.kind === "discount");
  // A banner coupon without its image uploaded yet can't print anything, and
  // the server rejects it — so it isn't offered.
  const bannerCoupons = coupons.filter((c) => c.kind === "banner" && c.banner_path);
  const selectedBanner = bannerCoupons.find((c) => c.code === bannerCode) ?? null;
  const selectedCoupon = discountCoupons.find((c) => c.code === couponCode) ?? null;
  const couponDiscount = selectedCoupon
    ? Math.min(
        selectedCoupon.discount_type === "percent" ? subtotal * (selectedCoupon.value / 100) : selectedCoupon.value,
        subtotal,
      )
    : 0;
  const grandTotalPreview = subtotal - couponDiscount + vatTotal + govtFeeTotal + bankFeeTotal + edrhFeeTotal;

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
      const invoice = await createInvoice({
        customer_id: customer.id,
        employee_customer_id: employeeId || null,
        payment_method: paymentMethod,
        invoice_date: invoiceDate,
        // Invoices here are paid at the point of sale, so there's no due
        // date to collect — the field stays nullable for older records
        // that have one.
        due_date: null,
        notes,
        terms,
        show_bank_details: showBankDetails,
        coupon_code: couponCode || null,
        banner_coupon_code: bannerCode || null,
        auto_reference_numbers: showFeeBreakdown && autoReferences,
        items,
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not create invoice. Check the fields and try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-ink">New Invoice</h1>

      {/* Single full-width column: the line-item table needs the room, and
          the totals/coupon read better as a summary under the form than as a
          narrow sidebar next to it.
          onKeyDown, not a <form>: Enter walks to the next field rather than
          submitting, so creating the invoice stays an explicit click. */}
      <div className="space-y-6" onKeyDown={advanceOnEnter}>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold text-ink">Invoice details</h2>

          {/* Paired so neither the radio group nor the customer search is
              stretched across the full page width. */}
          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
                <Wallet size={14} className="opacity-70" /> Payment method
              </span>
              <RadioGroup
                value={paymentMethod}
                onChange={setPaymentMethod}
                options={[
                  { value: "cash", label: "Cash" },
                  { value: "card", label: "Card" },
                  { value: "online", label: "Online" },
                ]}
              />
            </div>

            <div>
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted">
                <User size={14} className="opacity-70" /> Customer
              </span>
              {customer ? (
                <div className="flex items-center justify-between rounded-lg border border-line bg-bg px-4 py-3 text-sm">
                  <span>
                    {customer.name} <span className="text-xs text-muted capitalize">({customer.type})</span>
                  </span>
                  <button type="button" onClick={() => setCustomer(null)} className="text-xs text-muted hover:text-ink">
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
          </div>

          {customer?.type === "company" && (
            <Field label="Employee" hint="(optional)" icon={User} className="mb-4">
              <Select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">— none —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Quarter width � the card spans the page now, and a date input
              stretched across half of it looks broken. */}
          <div className="grid grid-cols-4 gap-4">
            <Field label="Invoice date" icon={CalendarDays}>
              <TextInput type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-ink">Service Items</h2>
            {showFeeBreakdown && (
              <Toggle
                checked={autoReferences}
                onChange={setAutoReferences}
                label="Auto Trans No. & Inv No. (Inv No. = receipt number)"
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
          <h2 className="mb-4 text-sm font-semibold text-ink">Notes & terms</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Notes" icon={FileText}>
              <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <Field label="Terms" icon={Tag}>
              <TextArea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
          </div>
          <div className="mt-4">
            <Toggle checked={showBankDetails} onChange={setShowBankDetails} label="Include bank details on invoice" />
          </div>
        </div>

        <div className="grid grid-cols-2 items-start gap-6">
          {couponsEnabled && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Ticket size={14} className="opacity-70" /> Coupon
              </h2>
              <div className="space-y-4">
                <Field label="Discount coupon">
                  <Select value={couponCode} onChange={(e) => setCouponCode(e.target.value)} disabled={discountCoupons.length === 0}>
                    <option value="">{discountCoupons.length === 0 ? "No active discount coupons" : "— No discount —"}</option>
                    {discountCoupons.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code} — {c.discount_type === "percent" ? `${c.value}% off` : `${c.value.toFixed(2)} off`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Printed banner" hint="(printed on the invoice)">
                  <Select value={bannerCode} onChange={(e) => setBannerCode(e.target.value)} disabled={bannerCoupons.length === 0}>
                    <option value="">{bannerCoupons.length === 0 ? "No active banners" : "— No banner —"}</option>
                    {bannerCoupons.map((c) => (
                      <option key={c.id} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </Select>
                  {selectedBanner && (
                    <img
                      src={resolveAssetUrl(selectedBanner.banner_path) ?? ""}
                      alt={`${selectedBanner.code} banner`}
                      className="mt-2 max-h-24 w-full rounded-md border border-line bg-white object-contain"
                    />
                  )}
                </Field>
              </div>
            </div>
          )}

          {/* Always the right-hand cell, so the totals stay put whether or
              not the coupons module is on for this business. */}
          <div className="col-start-2 rounded-lg border border-line bg-surface p-4 text-sm">
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
              {selectedCoupon && (
                <div className="flex justify-between text-accent-green">
                  <span>Coupon ({selectedCoupon.code})</span>
                  <span>−{couponDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                <span>Grand total</span>
                <span>{grandTotalPreview.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pinned to the bottom of the scrolling <main> so the running total
            stays on screen while you're editing line items — the totals
            recompute on every keystroke, but the summary card below is off
            the fold on a long invoice, so you'd never see it happen.
            The negative margins let the bar span main's p-6 gutter. */}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center gap-4 border-t border-line bg-bg/95 px-6 py-3 backdrop-blur">
          <span className="text-sm text-muted">Grand total</span>
          <span className="text-xl font-semibold tabular-nums text-ink">{grandTotalPreview.toFixed(2)}</span>
          {error && <p className="ml-auto text-sm text-danger">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`${error ? "" : "ml-auto"} rounded-md bg-accent px-8 py-3 text-sm font-medium text-ink transition-opacity hover:opacity-90 disabled:opacity-50`}
          >
            {saving ? "Saving..." : "Create invoice"}
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
