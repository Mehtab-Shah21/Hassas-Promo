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
    "layout_preset": "classic",  # classic | modern | minimal
    "primary_color": "#4F46E5",
    "accent_color": "#7C3AED",
    "font_family": "sans",  # sans | serif | mono — see FONT_FAMILY_CSS below
    "font_size": "normal",  # small | normal | large
    "logo_enabled": True,
    "logo_position": "left",  # left | center | right
    "show_sender_block": True,
    "show_tax_breakdown": True,
    "show_notes": True,
    "show_terms": True,
    "show_signature": False,
    "show_amount_in_words": False,
    "table_style": "simple",  # simple | striped | bordered
    "bill_to_fields": ["email", "phone", "address", "tax_id"],
}

# xhtml2pdf/reportlab only reliably renders its 3 built-in generic families —
# every other named font (DejaVu, Georgia, Inter, ...) silently falls back to
# one of these regardless of what's requested (verified: custom @font-face
# TTF embedding fails on this stack even with a valid local file — the
# in-flow CSS keyword is what actually decides the output font). So the
# config only offers these three, honestly labeled, and the CSS names them
# for what they really render as rather than pretending otherwise.
FONT_FAMILY_CSS = {
    "sans": "Helvetica, Arial, sans-serif",
    "serif": "Times-Roman, Georgia, serif",
    "mono": "Courier, monospace",
}

DOC_KINDS = ("invoice", "quotation")


def resolve_template_config(business: Business, doc_kind: str, override: dict | None = None) -> dict:
    """template_config is one JSON blob shaped {"invoice": {...}, "quotation": {...}}
    so each document type has its own saved design. A pre-existing flat config
    (saved before per-document-type configs existed) is treated as applying to
    both kinds — this needs no Alembic migration since it's read/written
    entirely in Python against the existing JSON column."""
    config = dict(DEFAULT_TEMPLATE_CONFIG)
    stored = business.template_config
    if isinstance(stored, dict):
        if isinstance(stored.get(doc_kind), dict):
            config.update(stored[doc_kind])
        elif "primary_color" in stored or "layout_preset" in stored:
            config.update(stored)
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


def _logo_uri(business: Business, base_url: str | None = None) -> str | None:
    if not business.logo_path:
        return None
    filename = business.logo_path.rsplit("/", 1)[-1]
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        return None
    if base_url:
        # Browser-rendered previews (Design Studio's live preview iframe)
        # can't load file:// URIs — browsers block local filesystem access
        # from web content regardless of same-origin/srcDoc, unlike
        # xhtml2pdf's server-side renderer which has no such sandbox. Serve
        # it over HTTP from the app's own /uploads static mount instead,
        # resolved against whatever host:port the browser actually used to
        # reach this request (so it works on localhost and over the LAN).
        return f"{base_url.rstrip('/')}/uploads/{filename}"
    return file_path.resolve().as_uri()


def _py_date_format(fmt: str) -> str:
    return (
        fmt.replace("DD", "%d").replace("MM", "%m").replace("YYYY", "%Y")
        if fmt
        else "%d/%m/%Y"
    )


def render_document_html(
    *,
    doc_kind: str,
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
    base_url: str | None = None,
) -> str:
    template = _env.get_template("document.html.jinja2")
    config = resolve_template_config(business, doc_kind, config_override)
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
        font_family_css=FONT_FAMILY_CSS.get(config["font_family"], FONT_FAMILY_CSS["sans"]),
        logo_uri=_logo_uri(business, base_url) if config["logo_enabled"] else None,
        config=config,
        amount_in_words=number_to_words(grand_total, business.base_currency) if config["show_amount_in_words"] else None,
    )


def render_invoice_html(invoice, business: Business, customer: Customer, employee: Customer | None, coupon_code: str | None = None) -> str:
    return render_document_html(
        doc_kind="invoice",
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
        doc_kind="quotation",
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


DEFAULT_THERMAL_CONFIG = {
    "logo_enabled": False,
    "header_text": "",
    "footer_text": "Thank you for your business!",
    "font_size": "normal",  # small | normal | large
    "show_customer_name": True,
    "show_payment_method": True,
    "show_tax_breakdown": True,
    "show_reprint_notice": False,
}

_THERMAL_FONT_PT = {"small": 7, "normal": 8, "large": 9.5}


def resolve_thermal_config(business: Business, override: dict | None = None) -> dict:
    config = dict(DEFAULT_THERMAL_CONFIG)
    if business.thermal_template_config and isinstance(business.thermal_template_config, dict):
        config.update(business.thermal_template_config)
    if override:
        config.update(override)
    return config


def render_thermal_html(
    *,
    doc_type: str,
    number: str,
    doc_date: str,
    status: str,
    business: Business,
    customer_name: str | None,
    items: Sequence,
    subtotal: float,
    discount_total: float,
    vat_total: float,
    grand_total: float,
    payment_method: str | None,
    currency: str,
    paper_width_mm: int,
    config_override: dict | None = None,
    base_url: str | None = None,
) -> str:
    template = _env.get_template("thermal_receipt.html.jinja2")
    config = resolve_thermal_config(business, config_override)
    num_items = max(len(items), 1)
    # Thermal rolls are continuous-feed, but a PDF page needs a fixed
    # height — reportlab/xhtml2pdf would otherwise spill a near-empty
    # "page 2". Estimate a height from the item count instead of using one
    # fixed guess, so typical 1-5 line service invoices fit on one page
    # without wasting a meter of blank paper.
    page_height_mm = min(400, max(120, 60 + num_items * 8))
    font_size_pt = _THERMAL_FONT_PT.get(config["font_size"], 8)

    return template.render(
        doc_type=doc_type,
        doc_type_upper=doc_type.upper(),
        number=number,
        doc_date=doc_date,
        status=status,
        status_upper=str(status).upper(),
        business=business,
        customer_name=customer_name,
        items=items,
        subtotal=subtotal,
        discount_total=discount_total,
        vat_total=vat_total,
        grand_total=grand_total,
        payment_method=payment_method,
        currency=currency,
        page_width_mm=paper_width_mm,
        page_height_mm=page_height_mm,
        font_size_pt=font_size_pt,
        logo_uri=_logo_uri(business, base_url) if config["logo_enabled"] else None,
        config=config,
    )


def _thermal_width_mm(business: Business, width_override: int | None = None) -> int:
    if width_override in (58, 80):
        return width_override
    try:
        return int((business.thermal_paper_width or "80mm").replace("mm", ""))
    except ValueError:
        return 80


def render_invoice_thermal_html(invoice, business: Business, customer: Customer, width_override: int | None = None) -> str:
    payment_method = invoice.payments[-1].method if invoice.payments else None
    return render_thermal_html(
        doc_type="Invoice",
        number=invoice.number,
        doc_date=invoice.invoice_date.strftime(_py_date_format(business.date_format)),
        status=invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        business=business,
        customer_name=customer.name if customer else None,
        items=invoice.items,
        subtotal=float(invoice.subtotal),
        discount_total=float(invoice.discount_total),
        vat_total=float(invoice.vat_total),
        grand_total=float(invoice.grand_total),
        payment_method=payment_method,
        currency=_currency_symbol(business),
        paper_width_mm=_thermal_width_mm(business, width_override),
    )


def render_quotation_thermal_html(quotation, business: Business, customer: Customer, width_override: int | None = None) -> str:
    return render_thermal_html(
        doc_type="Quotation",
        number=quotation.number,
        doc_date=quotation.quotation_date.strftime(_py_date_format(business.date_format)),
        status=quotation.status.value if hasattr(quotation.status, "value") else quotation.status,
        business=business,
        customer_name=customer.name if customer else None,
        items=quotation.items,
        subtotal=float(quotation.subtotal),
        discount_total=float(quotation.discount_total),
        vat_total=float(quotation.vat_total),
        grand_total=float(quotation.grand_total),
        payment_method=None,
        currency=_currency_symbol(business),
        paper_width_mm=_thermal_width_mm(business, width_override),
    )


def render_thermal_sample_html(
    business: Business,
    doc_type: str = "Invoice",
    config_override: dict | None = None,
    width_override: int | None = None,
    base_url: str | None = None,
) -> str:
    """Renders the thermal template with fabricated data — used by Design
    Studio's Thermal Receipt tab live preview."""
    from datetime import date

    items = [_SampleItem("Visa Renewal Service", 1, 350.0, 500.0, 0.0, float(business.default_vat_rate))]
    subtotal = sum(i.qty * i.unit_price - i.discount for i in items)
    vat_total = sum((i.qty * i.unit_price - i.discount) * (i.vat_rate / 100) for i in items)
    grand_total = subtotal + vat_total

    return render_thermal_html(
        doc_type=doc_type,
        number="INV-00001",
        doc_date=date.today().strftime(_py_date_format(business.date_format)),
        status="paid",
        business=business,
        customer_name=_SampleCustomer.name,
        items=items,
        subtotal=round(subtotal, 2),
        discount_total=0.0,
        vat_total=round(vat_total, 2),
        grand_total=round(grand_total, 2),
        payment_method="Cash",
        currency=_currency_symbol(business),
        paper_width_mm=_thermal_width_mm(business, width_override),
        config_override=config_override,
        base_url=base_url,
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


def render_sample_html(
    business: Business,
    doc_kind: str = "invoice",
    config_override: dict | None = None,
    base_url: str | None = None,
) -> str:
    """Renders the shared template with fabricated data — used by the Design
    Studio live preview so admins can see their branding without needing a
    real invoice/quotation."""
    from datetime import date, timedelta

    items = [
        _SampleItem("Visa Renewal Service", 1, 350.0, 500.0, 0.0, float(business.default_vat_rate)),
        _SampleItem("Document Attestation", 2, 120.0, 0.0, 20.0, float(business.default_vat_rate)),
    ]
    subtotal = sum(i.qty * i.unit_price - i.discount for i in items)
    vat_total = sum((i.qty * i.unit_price - i.discount) * (i.vat_rate / 100) for i in items)
    govt_fee_total = sum(i.govt_fee * i.qty for i in items)
    grand_total = subtotal + vat_total + govt_fee_total
    is_quotation = doc_kind == "quotation"

    return render_document_html(
        doc_kind=doc_kind,
        doc_type="Quotation" if is_quotation else "Tax Invoice",
        number="QTN-00001" if is_quotation else "INV-00001",
        doc_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        due_label="Valid Until" if is_quotation else "Due Date",
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
        notes=(business.default_quotation_notes if is_quotation else business.default_invoice_notes_credit) or "Thank you for your business.",
        terms=(business.default_quotation_terms if is_quotation else business.default_invoice_terms_credit) or "Payment due within 14 days.",
        config_override=config_override,
        base_url=base_url,
    )


class PdfEngineUnavailable(RuntimeError):
    pass


def _resolve_local_uri(uri: str, _rel: str | None) -> str:
    """xhtml2pdf's own file:// resolution mis-parses Windows drive-letter
    URIs (file:///C:/...) and silently drops the resource — confirmed by
    tracing it directly: without this callback, a local logo <img> never
    makes it into the PDF at all, no error, just missing. This strips the
    URI down to a plain filesystem path xhtml2pdf can actually open."""
    if uri.startswith("file://"):
        from urllib.parse import unquote, urlparse

        path = unquote(urlparse(uri).path)
        if path.startswith("/") and len(path) > 2 and path[2] == ":":
            path = path.lstrip("/")  # file:///C:/... -> C:/...
        return path
    return uri


def render_pdf(html: str) -> bytes:
    """xhtml2pdf is pure Python (no native GTK/Pango runtime, unlike
    WeasyPrint) so it bundles cleanly into a PyInstaller exe — see
    packaging/README.md. Its HTML/CSS support is weaker than WeasyPrint's
    (no flexbox/grid, limited box model) — see QUESTIONS.md for what that
    means for the shared template's fidelity."""
    import io

    from xhtml2pdf import pisa

    buffer = io.BytesIO()
    result = pisa.CreatePDF(src=html, dest=buffer, link_callback=_resolve_local_uri)
    if result.err:
        raise PdfEngineUnavailable(f"xhtml2pdf failed to render the PDF (err={result.err}).")
    return buffer.getvalue()
