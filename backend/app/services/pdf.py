"""Shared HTML/PDF rendering for invoices and quotations.

One Jinja2 template (templates/document.html.jinja2) drives both the
on-screen preview (plain HTML response) and the actual PDF (via WeasyPrint) —
per CLAUDE.md they must never drift, and per Prompt 7 quotations reuse the
same template as invoices (a "Quotation" heading variant). WeasyPrint needs
native GTK/Pango libraries that aren't always present on a fresh Windows
machine, so the import is isolated here: HTML preview keeps working even if
WeasyPrint can't load, and the PDF endpoint raises a clear, actionable error
instead of a raw stack trace.
"""

from datetime import date
from pathlib import Path
from typing import Sequence

from jinja2 import Environment, FileSystemLoader

from app.core.config import resource_dir, settings
from app.models.business import Business
from app.models.customer import Customer

TEMPLATE_DIR = resource_dir() / "app" / "templates"
UPLOAD_DIR = Path(settings.upload_dir)

_env = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), autoescape=True)

DEFAULT_TEMPLATE_CONFIG = {
    "layout_preset": "classic",
    "primary_color": "#4F46E5",
    "accent_color": "#7C3AED",
    "font_family": "sans",  # sans | serif
    "font_size": "normal",  # small | normal | large
    "logo_enabled": True,
    "logo_position": "left",  # left | center | right
    "show_sender_block": True,
    "show_tax_breakdown": True,
    "show_notes": True,
    "show_terms": True,
    "show_signature": False,
    "show_watermark": False,
    "show_amount_in_words": False,
    "table_style": "simple",  # simple | striped | bordered
    "bill_to_fields": ["email", "phone", "address", "tax_id"],
}


def resolve_template_config(business: Business, override: dict | None = None) -> dict:
    config = dict(DEFAULT_TEMPLATE_CONFIG)
    if business.template_config and isinstance(business.template_config, dict):
        config.update(business.template_config)
    if override:
        config.update(override)
    return config


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _three_digits_to_words(n: int) -> str:
    words = []
    if n >= 100:
        words.append(f"{_ONES[n // 100]} Hundred")
        n %= 100
    if n >= 20:
        tens_word = _TENS[n // 10]
        if n % 10:
            tens_word += f"-{_ONES[n % 10].lower()}"
        words.append(tens_word)
    elif n > 0:
        words.append(_ONES[n])
    return " ".join(words)


def number_to_words(amount: float, currency: str) -> str:
    whole = int(amount)
    cents = round((amount - whole) * 100)
    if whole == 0:
        whole_words = "Zero"
    else:
        parts = []
        scale = [(1_000_000_000, "Billion"), (1_000_000, "Million"), (1_000, "Thousand"), (1, "")]
        remainder = whole
        for value, name in scale:
            if remainder >= value:
                count = remainder // value
                remainder %= value
                chunk = _three_digits_to_words(count)
                parts.append(f"{chunk} {name}".strip())
        whole_words = " ".join(parts)
    result = f"{whole_words} {currency}"
    if cents:
        result += f" and {_three_digits_to_words(cents)} Cents"
    return f"{result} Only"


def _currency_symbol(business: Business) -> str:
    if business.currency_display == "code":
        return business.base_currency
    symbols = {"AED": "AED", "SAR": "SAR", "USD": "$", "EUR": "€", "GBP": "£", "QAR": "QAR", "KWD": "KWD", "BHD": "BHD", "OMR": "OMR"}
    return symbols.get(business.base_currency, business.base_currency)


def _logo_uri(business: Business) -> str | None:
    if not business.logo_path:
        return None
    filename = business.logo_path.rsplit("/", 1)[-1]
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        return None
    return file_path.resolve().as_uri()


def _py_date_format(fmt: str) -> str:
    return (
        fmt.replace("DD", "%d").replace("MM", "%m").replace("YYYY", "%Y")
        if fmt
        else "%d/%m/%Y"
    )


def render_document_html(
    *,
    doc_type: str,
    number: str,
    doc_date: date,
    due_date: date | None,
    due_label: str,
    status: str,
    business: Business,
    customer: Customer,
    employee: Customer | None,
    items: Sequence,
    show_govt_fee: bool,
    show_bank_details: bool,
    subtotal: float,
    discount_total: float,
    coupon_code: str | None,
    vat_total: float,
    govt_fee_total: float,
    grand_total: float,
    amount_paid: float,
    notes: str | None,
    terms: str | None,
    config_override: dict | None = None,
) -> str:
    template = _env.get_template("document.html.jinja2")
    config = resolve_template_config(business, config_override)
    date_fmt = _py_date_format(business.date_format)
    currency = _currency_symbol(business)

    return template.render(
        doc_type=doc_type,
        number=number,
        doc_date=doc_date.strftime(date_fmt),
        due_date=due_date.strftime(date_fmt) if due_date else None,
        due_label=due_label,
        status=status,
        business=business,
        customer=customer,
        employee=employee,
        items=items,
        show_govt_fee=show_govt_fee,
        show_bank_details=show_bank_details,
        subtotal=subtotal,
        discount_total=discount_total,
        coupon_code=coupon_code,
        vat_total=vat_total,
        govt_fee_total=govt_fee_total,
        grand_total=grand_total,
        amount_paid=amount_paid,
        notes=notes,
        terms=terms,
        currency=currency,
        primary_color=config["primary_color"],
        accent_color=config["accent_color"],
        logo_uri=_logo_uri(business) if config["logo_enabled"] else None,
        config=config,
        amount_in_words=number_to_words(grand_total, business.base_currency) if config["show_amount_in_words"] else None,
    )


def render_invoice_html(invoice, business: Business, customer: Customer, employee: Customer | None, coupon_code: str | None = None) -> str:
    return render_document_html(
        doc_type="Tax Invoice",
        number=invoice.number,
        doc_date=invoice.invoice_date,
        due_date=invoice.due_date,
        due_label="Due Date",
        status=invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        business=business,
        customer=customer,
        employee=employee,
        items=invoice.items,
        show_govt_fee=business.show_govt_fee_on_invoice,
        show_bank_details=invoice.show_bank_details,
        subtotal=float(invoice.subtotal),
        discount_total=float(invoice.discount_total),
        coupon_code=coupon_code,
        vat_total=float(invoice.vat_total),
        govt_fee_total=float(invoice.govt_fee_total),
        grand_total=float(invoice.grand_total),
        amount_paid=float(invoice.amount_paid),
        notes=invoice.notes,
        terms=invoice.terms,
    )


def render_quotation_html(quotation, business: Business, customer: Customer, employee: Customer | None, coupon_code: str | None = None) -> str:
    return render_document_html(
        doc_type="Quotation",
        number=quotation.number,
        doc_date=quotation.quotation_date,
        due_date=quotation.valid_until,
        due_label="Valid Until",
        status=quotation.status.value if hasattr(quotation.status, "value") else quotation.status,
        business=business,
        customer=customer,
        employee=employee,
        items=quotation.items,
        show_govt_fee=business.show_govt_fee_on_invoice,
        show_bank_details=quotation.show_bank_details,
        subtotal=float(quotation.subtotal),
        discount_total=float(quotation.discount_total),
        coupon_code=coupon_code,
        vat_total=float(quotation.vat_total),
        govt_fee_total=float(quotation.govt_fee_total),
        grand_total=float(quotation.grand_total),
        amount_paid=0.0,
        notes=quotation.notes,
        terms=quotation.terms,
    )


class _SampleItem:
    def __init__(self, description: str, qty: float, unit_price: float, govt_fee: float, discount: float, vat_rate: float):
        self.description = description
        self.qty = qty
        self.unit_price = unit_price
        self.govt_fee = govt_fee
        self.discount = discount
        self.vat_rate = vat_rate
        net = qty * unit_price - discount
        self.line_total = net + net * (vat_rate / 100)


class _SampleCustomer:
    name = "Sample Customer LLC"
    address_line1 = "123 Business Bay"
    address_line2 = "Suite 400"
    city = "Dubai"
    state = "Dubai"
    country = "UAE"
    phone_code = "+971"
    phone = "50 123 4567"
    email = "customer@example.com"
    id_kind = "vat_tax"
    id_value = "100234567800003"


def render_sample_html(business: Business, doc_type: str = "Tax Invoice", config_override: dict | None = None) -> str:
    """Renders the shared template with fabricated data — used by the Design
    Studio live preview so admins can see their branding without needing a
    real invoice."""
    from datetime import date, timedelta

    items = [
        _SampleItem("Visa Renewal Service", 1, 350.0, 500.0, 0.0, float(business.default_vat_rate)),
        _SampleItem("Document Attestation", 2, 120.0, 0.0, 20.0, float(business.default_vat_rate)),
    ]
    subtotal = sum(i.qty * i.unit_price - i.discount for i in items)
    vat_total = sum((i.qty * i.unit_price - i.discount) * (i.vat_rate / 100) for i in items)
    govt_fee_total = sum(i.govt_fee * i.qty for i in items)
    grand_total = subtotal + vat_total + govt_fee_total

    return render_document_html(
        doc_type=doc_type,
        number="INV-00001",
        doc_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        due_label="Due Date",
        status="sent",
        business=business,
        customer=_SampleCustomer(),
        employee=None,
        items=items,
        show_govt_fee=business.show_govt_fee_on_invoice,
        show_bank_details=True,
        subtotal=round(subtotal, 2),
        discount_total=20.0,
        coupon_code=None,
        vat_total=round(vat_total, 2),
        govt_fee_total=round(govt_fee_total, 2),
        grand_total=round(grand_total, 2),
        amount_paid=0.0,
        notes=business.default_invoice_notes_credit or "Thank you for your business.",
        terms=business.default_invoice_terms_credit or "Payment due within 14 days.",
        config_override=config_override,
    )


class PdfEngineUnavailable(RuntimeError):
    pass


def render_pdf(html: str) -> bytes:
    """xhtml2pdf is pure Python (no native GTK/Pango runtime, unlike
    WeasyPrint) so it bundles cleanly into a PyInstaller exe — see
    packaging/README.md. Its HTML/CSS support is weaker than WeasyPrint's
    (no flexbox/grid, limited box model) — see QUESTIONS.md for what that
    means for the shared template's fidelity."""
    import io

    from xhtml2pdf import pisa

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer)
    if result.err:
        raise PdfEngineUnavailable(f"xhtml2pdf failed to render the PDF (err={result.err}).")
    return buffer.getvalue()
