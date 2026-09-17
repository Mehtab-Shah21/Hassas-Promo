"""Renders fixed Arabic label strings as small transparent PNGs, embedded as
data: URI <img> tags in HTML.

Why this exists: xhtml2pdf/reportlab (this app's PDF engine, see pdf.py's
FONT_FAMILY_CSS comment) can only reliably render its 3 built-in fonts —
Helvetica/Times/Courier — none of which have Arabic glyphs. Registering a
custom Arabic-capable font (Tahoma, via @font-face or reportlab's own font
registration) was tried and confirmed not to take effect in this pipeline;
the text still falls back to a Latin-only built-in font and every Arabic
character renders as a solid missing-glyph box. There is no CSS/font-config
fix for this — the workaround is to render Arabic text to a bitmap using a
library that actually does its own font rasterizing (Pillow, via FreeType)
and embed that as an image, exactly like logos already are.

Only used by the exact hassas/iim templates, whose Arabic header text is
fixed boilerplate (business address/labels), not user-entered data — a
narrow, low-risk fix scoped to what's actually needed, not a general
Arabic-documents feature.
"""

import base64
import io
from functools import lru_cache

import arabic_reshaper
from bidi.algorithm import get_display
from PIL import Image, ImageDraw, ImageFont

# Tahoma ships with every modern Windows install (this is a Windows-only
# desktop app per CLAUDE.md's packaging plan) and has full Arabic coverage.
_FONT_REGULAR = "C:/Windows/Fonts/tahoma.ttf"
_FONT_BOLD = "C:/Windows/Fonts/tahomabd.ttf"

# Internal render resolution vs. final display size — renders at a much
# higher pixel size than it's ever displayed at, so the downscaled result
# looks crisp (anti-aliased) at print resolution instead of pixelated.
_OVERSAMPLE = 4


@lru_cache(maxsize=8)
def _load_font(bold: bool, size_px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(_FONT_BOLD if bold else _FONT_REGULAR, size_px)


def _hex_to_rgb(color: str) -> tuple[int, int, int]:
    color = color.lstrip("#")
    return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


@lru_cache(maxsize=128)
def _render_png_b64(text: str, font_px: int, bold: bool, color: str) -> tuple[str, int, int]:
    shaped = get_display(arabic_reshaper.reshape(text))
    font = _load_font(bold, font_px)
    probe = ImageDraw.Draw(Image.new("RGBA", (10, 10)))
    bbox = probe.textbbox((0, 0), shaped, font=font)
    pad = 2
    width, height = bbox[2] - bbox[0] + pad * 2, bbox[3] - bbox[1] + pad * 2
    img = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    ImageDraw.Draw(img).text((pad - bbox[0], pad - bbox[1]), shaped, font=font, fill=_hex_to_rgb(color) + (255,))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode(), width, height


def arabic_label(text: str, display_height_px: int, bold: bool = False, color: str = "#000000") -> dict:
    """A fixed Arabic string, pre-shaped/reordered and rendered to a PNG,
    ready to drop straight into an <img src/width/height>. display_height_px
    is the height it should actually appear at in the page — the PNG itself
    is rendered several times larger internally, then explicit width/height
    HTML attributes scale it back down (xhtml2pdf ignores CSS width/height
    on <img> but honors the HTML attributes — same technique pdf.py's
    _logo_fit_px already relies on for the business logo)."""
    font_px = display_height_px * _OVERSAMPLE
    b64, w, h = _render_png_b64(text, font_px, bold, color)
    scale = display_height_px / h
    return {
        "uri": f"data:image/png;base64,{b64}",
        "width": max(1, round(w * scale)),
        "height": max(1, round(h * scale)),
    }
