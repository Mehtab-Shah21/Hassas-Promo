"""Pixel-exact invoice/quotation PDFs for businesses on a fixed client design.

Re-creating the client artwork in HTML never matched: xhtml2pdf can't embed
custom fonts, ignores `table-layout: fixed`, collapses empty cells, and has no
absolute positioning. The originals are also US Letter, while the HTML
templates were A4, so the proportions could never line up.

So this module doesn't re-create the artwork at all. It takes the client's own
vector PDF as the page and draws *only* the variable data on top of it. The
header box, logo, Arabic labels, column headings, tinted totals block and the
footer band are therefore exact by construction — they are still the client's
own vector objects, so they stay sharp at any zoom and the Arabic remains real
selectable text rather than the bitmap images the HTML path had to paste in.

Coordinates below were measured off the source PDFs (see the module-level
comment on each spec); they are in the PDF's own top-left origin, converted to
ReportLab's bottom-left origin by `_Painter.y()`.

Only reportlab and pypdf are used, both already declared in requirements and
both BSD — deliberately not PyMuPDF, which is AGPL and would impose source
disclosure on a distributed desktop app.
"""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

from app.core.config import settings
from app.models.business import Business
from app.services.pdf import ASSETS_DIR

logger = logging.getLogger(__name__)

WINDOWS_FONTS = Path("C:/Windows/Fonts")

# The source documents are typeset in these; registering the same faces is what
# keeps the values we draw visually consistent with the labels already on the
# page. Berlin Sans FB (used for the client's fixed labels) is deliberately
# absent — it isn't installed on Windows by default, and every string set in it
# lives in the background layer, so we never need to reproduce it.
_FONT_FILES = {
    "SegoeUI": "segoeui.ttf",
    "SegoeUI-Bold": "segoeuib.ttf",
    "Calibri": "calibri.ttf",
    "Calibri-Bold": "calibrib.ttf",
    "CenturyGothic-Bold": "GOTHICB.TTF",
    "ArialBlack": "ariblk.ttf",
    "Arial-Bold": "arialbd.ttf",
}

_FALLBACK = {"SegoeUI": "Helvetica", "SegoeUI-Bold": "Helvetica-Bold",
             "Calibri": "Helvetica", "Calibri-Bold": "Helvetica-Bold",
             "CenturyGothic-Bold": "Helvetica-Bold", "ArialBlack": "Helvetica-Bold",
             "Arial-Bold": "Helvetica-Bold"}

_registered: dict[str, str] = {}


def _font(name: str) -> str:
    """Return a usable font name, registering the TTF on first use.

    Falls back to a built-in face if the system font is missing, so a missing
    font degrades the typography instead of failing the download.
    """
    if name in _registered:
        return _registered[name]
    path = WINDOWS_FONTS / _FONT_FILES[name]
    try:
        pdfmetrics.registerFont(TTFont(name, str(path)))
        _registered[name] = name
    except Exception:  # noqa: BLE001 - any font error must not break invoicing
        logger.warning("font %s unavailable at %s; falling back to %s", name, path, _FALLBACK[name])
        _registered[name] = _FALLBACK[name]
    return _registered[name]


@dataclass(frozen=True)
class Box:
    """A measured rectangle in the source PDF's top-left coordinate space."""

    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0


@dataclass(frozen=True)
class ExactTemplate:
    asset: str
    page_w: float
    page_h: float

    value_font: str
    value_size: float
    row_font: str
    row_size: float

    # Value cells of the two label/value tables, in render order.
    info_values: tuple[Box, ...]

    # Vertical rules of the items table, left to right; len == columns + 1.
    item_cols: tuple[float, ...]
    item_top: float
    item_row_h: float
    item_capacity: int
    # Rows whose grid the client already drew — we only add rules past these.
    item_predrawn: int
    desc_col: int
    total_col_fill: str | None
    # True when the client ruled every cell of the table (HASSAS). False when
    # the rows are implied by a tinted column with no internal rules (IIM) —
    # that changes both how pre-drawn rows are cleared and whether extra rows
    # need a grid drawn for them.
    row_grid: bool

    totals_values: tuple[Box, ...]
    totals_value_fill: str | None
    totals_block: Box
    vat_label: Box
    vat_label_font: str
    vat_label_size: float

    paid_x: float
    paid_y0: float
    paid_font: str
    paid_size: float
    paid_blank: Box
    # The empty area beside the totals block where a printed-banner coupon's
    # image goes. The image is scaled to fit without distortion.
    banner_slot: Box

    title: Box
    # Top y of the client's own title span, so a repainted title sits on their
    # exact baseline rather than a guessed centre.
    title_y0: float
    title_latin_font: str
    title_size: float
    title_arabic_font: str | None = None
    # Arabic rendered for a quotation; None means the title is Latin-only.
    title_arabic_quotation: str | None = None
    title_latin_quotation: str = "Quotation"
    rule: float = 1.0
    line_color: str = "#000000"
    columns_centred: tuple[int, ...] = field(default_factory=tuple)


# Measured from "HASSAS Invoice Temlete.pdf" (612x792, US Letter).
HASSAS = ExactTemplate(
    asset="hassas_template.pdf",
    page_w=612.0,
    page_h=792.0,
    value_font="SegoeUI",
    value_size=9.0,
    row_font="SegoeUI",
    row_size=8.0,
    info_values=(
        Box(166.6, 182.3, 463.3, 201.0),   # Establishment Name / Number
        Box(166.6, 201.0, 463.3, 218.4),   # Person Name / Phone Number
        Box(166.7, 225.7, 463.8, 246.9),   # DATE
        Box(166.7, 246.9, 463.8, 269.2),   # Receipt No
    ),
    item_cols=(36.1, 54.1, 166.0, 193.7, 260.9, 310.5, 359.9, 404.9, 449.9, 499.5, 571.8),
    item_top=306.5,
    item_row_h=19.2,
    item_capacity=5,
    item_predrawn=1,
    desc_col=1,
    total_col_fill=None,
    row_grid=True,
    totals_values=(
        Box(468.5, 418.1, 572.1, 435.9),
        Box(468.5, 435.9, 572.1, 453.7),
        Box(468.5, 453.7, 572.1, 471.3),
        Box(468.5, 471.3, 572.1, 489.6),
    ),
    totals_value_fill=None,
    totals_block=Box(356.1, 418.1, 572.1, 489.6),
    vat_label=Box(356.5, 435.9, 468.1, 453.7),
    vat_label_font="Calibri",
    vat_label_size=8.0,
    paid_x=44.64,
    paid_y0=626.67,
    paid_font="SegoeUI",
    paid_size=10.0,
    paid_blank=Box(40.0, 622.0, 320.0, 643.0),
    # Left of the totals block (which starts at x 356), down to above the
    # "Invoice paid" line.
    banner_slot=Box(36.1, 418.1, 350.0, 612.0),
    title=Box(200.0, 133.0, 412.0, 158.0),
    title_y0=135.69,
    title_latin_font="ArialBlack",
    title_size=16.0,
    title_arabic_font="Arial-Bold",
    title_arabic_quotation="عرض سعر",
)

# Measured from "IIM Technical Services invoice templete.pdf" (612x792).
IIM = ExactTemplate(
    asset="iim_template.pdf",
    page_w=612.0,
    page_h=792.0,
    value_font="Calibri",
    value_size=10.0,
    row_font="Calibri",
    row_size=10.0,
    info_values=(
        Box(121.9, 179.4, 212.0, 198.1),   # To
        Box(121.9, 198.1, 212.0, 216.7),   # Location
        Box(121.9, 216.7, 212.0, 234.1),   # Customer TRN
        Box(492.6, 195.3, 582.6, 213.3),   # Reference no.
        Box(492.6, 213.3, 582.6, 234.3),   # Date
    ),
    item_cols=(31.4, 76.6, 360.1, 396.1, 499.5, 582.8),
    item_top=265.9,
    item_row_h=26.325,
    item_capacity=4,
    item_predrawn=4,
    desc_col=1,
    total_col_fill="#D9D9D9",
    row_grid=False,
    totals_values=(
        Box(499.5, 371.4, 582.8, 396.8),
        Box(499.5, 396.8, 582.8, 422.1),
        Box(499.5, 422.1, 582.8, 447.4),
        Box(499.5, 447.9, 582.8, 473.2),
    ),
    totals_value_fill="#FFC000",
    totals_block=Box(396.1, 371.2, 582.8, 473.5),
    vat_label=Box(396.1, 396.8, 499.5, 422.1),
    vat_label_font="Calibri-Bold",
    vat_label_size=10.0,
    paid_x=54.24,
    paid_y0=641.19,
    paid_font="SegoeUI",
    paid_size=10.0,
    paid_blank=Box(50.0, 636.0, 330.0, 658.0),
    # Left of the totals block (which starts at x 396), down to above the
    # "Invoice paid" line.
    banner_slot=Box(31.4, 380.0, 388.0, 630.0),
    title=Box(210.0, 122.0, 410.0, 157.0),
    title_y0=125.88,
    title_latin_font="CenturyGothic-Bold",
    title_size=24.0,
)

TEMPLATES: dict[str, ExactTemplate] = {"hassas": HASSAS, "iim": IIM}


def has_exact_template(business: Business) -> bool:
    key = getattr(business, "custom_invoice_template", None)
    return bool(key) and key in TEMPLATES and (ASSETS_DIR / TEMPLATES[key].asset).exists()


def _shape_arabic(text: str) -> str:
    """Arabic needs joining + bidi reordering before it can be drawn as glyphs."""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display

        return get_display(arabic_reshaper.reshape(text))
    except Exception:  # noqa: BLE001
        logger.warning("Arabic shaping unavailable; drawing unshaped text")
        return text


def _phone(code: str | None, number: str | None) -> str:
    """Join a stored dialling code and number, skipping whichever is blank."""
    return " ".join(p.strip() for p in (code, number) if p and p.strip())


def _money(value: float) -> str:
    return f"{value:.2f}"


def _qty(value: float) -> str:
    return str(int(value)) if float(value) == int(value) else f"{value:g}"


class _Painter:
    """Draws the variable layer for one page, in template coordinates."""

    def __init__(self, spec: ExactTemplate):
        self.spec = spec
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=(spec.page_w, spec.page_h))

    def y(self, top_y: float) -> float:
        """Template top-left y -> ReportLab bottom-left y."""
        return self.spec.page_h - top_y

    def blank(self, box: Box, inset: float = 0.0, fill: str | None = None) -> None:
        """Hide something the client left on the template — a `/` or `\\`
        placeholder in a value cell, or a block that belongs only on the final
        page. `fill` must match the cell's own background (the client tints
        some of them), and the inset keeps the cell's rules intact."""
        self.c.setFillColor(HexColor(fill) if fill else white)
        self.c.rect(box.x0 + inset, self.y(box.y1) + inset,
                    box.w - 2 * inset, box.h - 2 * inset, stroke=0, fill=1)

    def text_centred(self, text: str, box: Box, font: str, size: float, pad: float = 3.0) -> None:
        if not text:
            return
        text, size = self._fit(text, box.w - 2 * pad, font, size)
        self.c.setFillColor(HexColor("#222222"))
        self.c.setFont(_font(font), size)
        baseline = self.y(box.y1) + (box.h - size) / 2 + size * 0.22
        self.c.drawCentredString((box.x0 + box.x1) / 2, baseline, text)

    def text_left(self, text: str, box: Box, font: str, size: float, pad: float = 4.0) -> None:
        if not text:
            return
        text, size = self._fit(text, box.w - 2 * pad, font, size)
        self.c.setFillColor(HexColor("#222222"))
        self.c.setFont(_font(font), size)
        baseline = self.y(box.y1) + (box.h - size) / 2 + size * 0.22
        self.c.drawString(box.x0 + pad, baseline, text)

    # The client's cells are sized for their own sample data; a real customer
    # name is often longer. Shrink a couple of points first so the whole value
    # still reads, and only clip when even that won't fit.
    _MIN_SIZE = 6.0

    def _fit(self, text: str, width: float, font: str, size: float) -> tuple[str, float]:
        name = _font(font)
        while size > self._MIN_SIZE and pdfmetrics.stringWidth(text, name, size) > width:
            size -= 0.5
        if pdfmetrics.stringWidth(text, name, size) <= width:
            return text, size
        ellipsis = "..."
        while text and pdfmetrics.stringWidth(text + ellipsis, name, size) > width:
            text = text[:-1]
        return text + ellipsis, size

    def text_at_baseline(self, text: str, x: float, top_y: float, font: str, size: float) -> None:
        """Place text on the same baseline as a measured source span."""
        name = _font(font)
        self.c.setFillColor(HexColor("#222222"))
        self.c.setFont(name, size)
        self.c.drawString(x, self.y(top_y) - pdfmetrics.getAscent(name, size), text)

    def save(self) -> io.BytesIO:
        self.c.save()
        self.buf.seek(0)
        return self.buf

    def new_page(self) -> None:
        self.c.showPage()


def _draw_rows(p: _Painter, rows: list[tuple[str, ...]], page_index: int) -> None:
    spec = p.spec
    last_col = len(spec.item_cols) - 2

    # The client left placeholder glyphs inside the rows they pre-drew. Clear
    # every pre-drawn cell first — including rows this invoice doesn't reach,
    # which should print as clean empty rows, not as the client's sample marks.
    area_top = spec.item_top
    area_bottom = spec.item_top + spec.item_predrawn * spec.item_row_h
    if spec.row_grid:
        # Ruled cells: clear each one individually, inset so the rules survive.
        for i in range(spec.item_predrawn):
            y0 = spec.item_top + i * spec.item_row_h
            for col in range(len(spec.item_cols) - 1):
                fill = spec.total_col_fill if (spec.total_col_fill and col == last_col) else None
                p.blank(Box(spec.item_cols[col], y0, spec.item_cols[col + 1], y0 + spec.item_row_h),
                        inset=1.2, fill=fill)
    else:
        # No internal rules, so clear the whole area in two strips instead —
        # per-cell clearing left white seams through the tinted column.
        p.blank(Box(spec.item_cols[0], area_top, spec.item_cols[last_col], area_bottom))
        if spec.total_col_fill:
            p.blank(Box(spec.item_cols[last_col], area_top, spec.item_cols[last_col + 1], area_bottom),
                    fill=spec.total_col_fill)

    p.c.setStrokeColor(HexColor(spec.line_color))
    p.c.setLineWidth(spec.rule)
    y = spec.item_top
    for i, row in enumerate(rows):
        y_next = y + spec.item_row_h
        # The client pre-drew some empty rows; adding rules over them would
        # double the stroke, so only draw the grid for rows beyond those.
        if spec.row_grid and i >= spec.item_predrawn:
            if spec.total_col_fill:
                p.c.setFillColor(HexColor(spec.total_col_fill))
                p.c.rect(spec.item_cols[-2], p.y(y_next),
                         spec.item_cols[-1] - spec.item_cols[-2], spec.item_row_h,
                         stroke=0, fill=1)
            p.c.line(spec.item_cols[0], p.y(y_next), spec.item_cols[-1], p.y(y_next))
            for x in spec.item_cols:
                p.c.line(x, p.y(y), x, p.y(y_next))
        for col, value in enumerate(row):
            box = Box(spec.item_cols[col], y, spec.item_cols[col + 1], y_next)
            if col == spec.desc_col:
                p.text_left(value, box, spec.row_font, spec.row_size)
            else:
                p.text_centred(value, box, spec.row_font, spec.row_size)
        y = y_next


def _draw_banner(p: _Painter, banner_path: str) -> None:
    """Draw a printed-banner coupon's image into the template's banner slot.

    Scaled to fit without distortion and pinned to the top of the slot, so it
    sits level with the totals block. A missing or unreadable file skips the
    banner rather than failing the whole invoice.
    """
    file = Path(settings.upload_dir) / Path(banner_path).name
    if not file.exists():
        logger.warning("banner image %s not found; printing invoice without it", file)
        return
    slot = p.spec.banner_slot
    try:
        p.c.drawImage(
            ImageReader(str(file)), slot.x0, p.y(slot.y1), width=slot.w, height=slot.h,
            preserveAspectRatio=True, anchor="n", mask="auto",
        )
    except Exception:  # noqa: BLE001 - a bad image must not block the invoice
        logger.warning("could not draw banner image %s", file, exc_info=True)


def _hassas_rows(items) -> list[tuple[str, ...]]:
    rows = []
    for idx, it in enumerate(items, start=1):
        net = max(float(it.unit_price) * float(it.qty) - float(it.discount), 0.0)
        vat = net * (float(it.vat_rate) / 100.0)
        fees = (float(it.govt_fee) + float(it.bank_fee) + float(it.edrh_fee)) * float(it.qty)
        rows.append((
            str(idx),
            it.description or "",
            _qty(float(it.qty)),
            it.trans_no or "",
            it.inv_no or "",
            _money(float(it.govt_fee)),
            _money(float(it.bank_fee)),
            _money(float(it.unit_price)),
            _money(float(it.edrh_fee)),
            _money(net + vat + fees),
        ))
    return rows


def _iim_rows(items) -> list[tuple[str, ...]]:
    return [
        (str(idx), it.description or "", _qty(float(it.qty)),
         _money(float(it.unit_price)), _money(float(it.line_total)))
        for idx, it in enumerate(items, start=1)
    ]


def render_exact_pdf(
    *,
    template_key: str,
    business: Business,
    customer,
    items,
    number: str,
    doc_date: str,
    is_quotation: bool,
    subtotal: float,
    vat_total: float,
    discount_total: float,
    grand_total: float,
    effective_vat_rate: float,
    payment_method: str | None,
    banner_path: str | None = None,
) -> bytes:
    spec = TEMPLATES[template_key]
    rows = _iim_rows(items) if template_key == "iim" else _hassas_rows(items)
    pages = [rows[i:i + spec.item_capacity] for i in range(0, len(rows), spec.item_capacity)] or [[]]

    p = _Painter(spec)
    for page_index, page_rows in enumerate(pages):
        last = page_index == len(pages) - 1

        # 1. Hide the client's "/" placeholders and the sample payment line.
        for box in spec.info_values:
            p.blank(box, inset=1.2)
        p.blank(spec.paid_blank)

        # 2. Header values. Only the final page carries the money.
        if template_key == "hassas":
            # Establishment Number is the business phone from Settings >
            # Company Profile, read at render time, so changing it there
            # updates every document printed afterwards.
            business_phone = _phone(business.phone_code, business.phone)
            establishment = business.name + (f" / {business_phone}" if business_phone else "")
            customer_phone = _phone(customer.phone_code, customer.phone)
            person = customer.name + (f" / {customer_phone}" if customer_phone else "")
            values = [establishment, person, doc_date, number]
        else:
            location = (customer.emirate.value if getattr(customer, "emirate", None)
                        else (customer.address_line1 or ""))
            # The customer form stores one ID field: a TRN for companies, an
            # Emirates ID for individuals (id_kind records which). Only a real
            # TRN belongs under "Customer TRN".
            id_kind = getattr(customer.id_kind, "value", customer.id_kind)
            trn = customer.id_value if id_kind == "vat_tax" and customer.id_value else ""
            values = [customer.name, location, trn, number, doc_date]
        for box, value in zip(spec.info_values, values):
            p.text_centred(value, box, spec.value_font, spec.value_size)

        # 3. A quotation reuses the invoice artwork, so its title is repainted.
        if is_quotation:
            p.blank(spec.title)
            lf = _font(spec.title_latin_font)
            # Sit on the client's own title baseline, derived from the font's
            # ascent, so the swapped word lines up with everything around it.
            baseline = p.y(spec.title_y0) - pdfmetrics.getAscent(lf, spec.title_size)
            p.c.setFillColor(HexColor("#000000"))
            if spec.title_arabic_quotation and spec.title_arabic_font:
                latin = f"{spec.title_latin_quotation} - "
                arabic = _shape_arabic(spec.title_arabic_quotation)
                af = _font(spec.title_arabic_font)
                latin_w = pdfmetrics.stringWidth(latin, lf, spec.title_size)
                width = latin_w + pdfmetrics.stringWidth(arabic, af, spec.title_size)
                x = (spec.page_w - width) / 2
                p.c.setFont(lf, spec.title_size)
                p.c.drawString(x, baseline, latin)
                p.c.setFont(af, spec.title_size)
                p.c.drawString(x + latin_w, baseline, arabic)
            else:
                p.c.setFont(lf, spec.title_size)
                p.c.drawCentredString(spec.page_w / 2, baseline, spec.title_latin_quotation.upper())

        _draw_rows(p, page_rows, page_index)

        if last:
            # The client hard-coded "VAT Percentage 5%". Repaint it only when
            # the real rate differs, so the common case stays their own text.
            if abs(effective_vat_rate - 5.0) > 0.01:
                p.blank(spec.vat_label, inset=1.2)
                p.text_centred(f"VAT Percentage {effective_vat_rate:g}%", spec.vat_label,
                               spec.vat_label_font, spec.vat_label_size)
            for box, value in zip(spec.totals_values,
                                  [subtotal, vat_total, discount_total, grand_total]):
                # Same placeholder-clearing as the item rows; these cells are
                # tinted on some templates, so repaint with their own colour.
                p.blank(box, inset=1.2, fill=spec.totals_value_fill)
                p.text_centred(_money(value), box, spec.row_font, spec.row_size)
            if not is_quotation and payment_method:
                p.text_at_baseline(f"Invoice paid: {payment_method.capitalize()}",
                                   spec.paid_x, spec.paid_y0, spec.paid_font, spec.paid_size)
            # Printed-banner coupon: final page only, beside the totals.
            if banner_path:
                _draw_banner(p, banner_path)
        else:
            # Totals belong on the last page only. Negative inset so the cover
            # extends past the block's own rules — a stroke straddles the
            # boundary, so an exact-size fill leaves its outline showing.
            p.blank(spec.totals_block, inset=-1.5)

        if not last:
            p.new_page()

    overlay = PdfReader(p.save())
    writer = PdfWriter()
    template_path = str(ASSETS_DIR / spec.asset)
    for overlay_page in overlay.pages:
        # merge_page mutates the background page in place, so each output page
        # needs its own copy of the template rather than a shared one.
        page = PdfReader(template_path).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def render_exact_invoice_pdf(invoice, business: Business, customer, date_text: str) -> bytes:
    rate = float(invoice.items[0].vat_rate) if invoice.items else float(business.default_vat_rate)
    return render_exact_pdf(
        template_key=business.custom_invoice_template,
        business=business,
        customer=customer,
        items=invoice.items,
        number=invoice.number,
        doc_date=date_text,
        is_quotation=False,
        subtotal=float(invoice.subtotal),
        vat_total=float(invoice.vat_total),
        discount_total=float(invoice.discount_total),
        grand_total=float(invoice.grand_total),
        effective_vat_rate=rate,
        payment_method=(invoice.payment_method.value
                        if hasattr(invoice.payment_method, "value") else invoice.payment_method),
        # The snapshot taken when the invoice was created, not the coupon's
        # current image — a reprint must match what the customer received.
        banner_path=getattr(invoice, "banner_path", None),
    )


def render_exact_quotation_pdf(quotation, business: Business, customer, date_text: str) -> bytes:
    rate = float(quotation.items[0].vat_rate) if quotation.items else float(business.default_vat_rate)
    return render_exact_pdf(
        template_key=business.custom_invoice_template,
        business=business,
        customer=customer,
        items=quotation.items,
        number=quotation.number,
        doc_date=date_text,
        is_quotation=True,
        subtotal=float(quotation.subtotal),
        vat_total=float(quotation.vat_total),
        discount_total=float(quotation.discount_total),
        grand_total=float(quotation.grand_total),
        effective_vat_rate=rate,
        payment_method=None,
    )
