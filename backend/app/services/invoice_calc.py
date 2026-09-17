from dataclasses import dataclass

from app.models.coupon import Coupon, DiscountType


@dataclass
class LineCalc:
    line_net: float
    line_vat: float
    line_total: float
    line_govt_fee: float
    line_bank_fee: float
    line_edrh_fee: float


def discount_amount(qty: float, unit_price: float, discount_pct: float) -> float:
    """Line discounts are typed as a percentage of the line's gross.

    Everything downstream — calc_line, the invoice/quotation totals, the PDF
    templates and the reports — works in currency, so the percentage is
    converted here once, at the point the line is built, and both the
    percentage and the resulting amount are stored on the row.
    """
    pct = min(max(discount_pct, 0.0), 100.0)
    return round(qty * unit_price * (pct / 100), 2)


def calc_line(
    qty: float,
    unit_price: float,
    discount: float,
    vat_rate: float,
    govt_fee: float,
    bank_fee: float = 0,
    edrh_fee: float = 0,
) -> LineCalc:
    gross = qty * unit_price
    net = max(gross - discount, 0)
    vat = net * (vat_rate / 100)
    # line_total is net+VAT only — govt/bank/e-drh fees are tracked
    # separately (line_govt_fee etc.) and folded into grand_total at the
    # invoice level in calc_invoice_totals, exactly as govt_fee always has
    # been. Deliberately NOT baked into line_total itself: that field is
    # displayed as-is by the generic template/other business's invoices,
    # and changing its long-established meaning here would silently alter
    # already-correct, already-tested output for every business that isn't
    # using HASSAS's exact template. HASSAS's own template computes its
    # fee-inclusive per-line "Total" column itself, from these same fields.
    line_govt_fee = round(govt_fee * qty, 2)
    line_bank_fee = round(bank_fee * qty, 2)
    line_edrh_fee = round(edrh_fee * qty, 2)
    total = net + vat
    return LineCalc(
        line_net=round(net, 2),
        line_vat=round(vat, 2),
        line_total=round(total, 2),
        line_govt_fee=line_govt_fee,
        line_bank_fee=line_bank_fee,
        line_edrh_fee=line_edrh_fee,
    )


@dataclass
class InvoiceTotals:
    subtotal: float
    line_discount_total: float
    coupon_discount: float
    discount_total: float
    vat_total: float
    govt_fee_total: float
    bank_fee_total: float
    edrh_fee_total: float
    grand_total: float


def calc_invoice_totals(
    lines: list[LineCalc],
    line_discounts: list[float],
    coupon: Coupon | None,
) -> InvoiceTotals:
    subtotal = round(sum(l.line_net for l in lines), 2)
    vat_total = round(sum(l.line_vat for l in lines), 2)
    govt_fee_total = round(sum(l.line_govt_fee for l in lines), 2)
    bank_fee_total = round(sum(l.line_bank_fee for l in lines), 2)
    edrh_fee_total = round(sum(l.line_edrh_fee for l in lines), 2)
    line_discount_total = round(sum(line_discounts), 2)

    coupon_discount = 0.0
    if coupon is not None:
        if coupon.discount_type == DiscountType.percent:
            coupon_discount = subtotal * (float(coupon.value) / 100)
        else:
            coupon_discount = float(coupon.value)
        coupon_discount = round(min(coupon_discount, subtotal), 2)

    grand_total = round(
        subtotal - coupon_discount + vat_total + govt_fee_total + bank_fee_total + edrh_fee_total, 2
    )

    return InvoiceTotals(
        subtotal=subtotal,
        line_discount_total=line_discount_total,
        coupon_discount=coupon_discount,
        discount_total=round(line_discount_total + coupon_discount, 2),
        vat_total=vat_total,
        govt_fee_total=govt_fee_total,
        bank_fee_total=bank_fee_total,
        edrh_fee_total=edrh_fee_total,
        grand_total=grand_total,
    )
