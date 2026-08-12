from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


OUTPUT_DIR = Path(__file__).resolve().parent
PAGE_WIDTH, PAGE_HEIGHT = letter
INK = HexColor("#20262d")


def draw_header(pdf: canvas.Canvas, title: str, subtitle: str) -> None:
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 17)
    pdf.drawString(0.8 * inch, PAGE_HEIGHT - 0.8 * inch, title)
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(HexColor("#68727d"))
    pdf.drawString(0.8 * inch, PAGE_HEIGHT - 1.02 * inch, subtitle)
    pdf.setStrokeColor(HexColor("#d8dde2"))
    pdf.line(0.8 * inch, PAGE_HEIGHT - 1.16 * inch, PAGE_WIDTH - 0.8 * inch, PAGE_HEIGHT - 1.16 * inch)


def single_column() -> None:
    path = OUTPUT_DIR / "anchor-single-column.pdf"
    pdf = canvas.Canvas(str(path), pagesize=letter)
    pdf.setTitle("Anchor fixture - single column")
    draw_header(pdf, "Reliable Selection Anchors", "Born-digital single-column fixture")

    style = ParagraphStyle(
        "body",
        fontName="Helvetica",
        fontSize=12,
        leading=18,
        textColor=INK,
        alignment=TA_LEFT,
    )
    paragraphs = [
        "A durable research thread begins with an exact passage, not a fuzzy substring search.",
        "The browser selection should map to canonical offsets while preserving punctuation and ordinary spaces.",
        "When the reader zooms, the saved page-space geometry should return to the same visible words.",
    ]
    y = PAGE_HEIGHT - 1.55 * inch
    for text in paragraphs:
        paragraph = Paragraph(text, style)
        _, height = paragraph.wrap(PAGE_WIDTH - 1.6 * inch, 2 * inch)
        paragraph.drawOn(pdf, 0.8 * inch, y - height)
        y -= height + 0.22 * inch

    pdf.save()


def two_column() -> None:
    path = OUTPUT_DIR / "anchor-two-column.pdf"
    pdf = canvas.Canvas(str(path), pagesize=letter)
    pdf.setTitle("Anchor fixture - two column")
    draw_header(pdf, "Reading Across Columns", "Untagged two-column academic-style fixture")

    style = ParagraphStyle(
        "column",
        fontName="Times-Roman",
        fontSize=10.5,
        leading=14.5,
        textColor=INK,
        alignment=TA_LEFT,
    )
    left = (
        "Left-column evidence stays within its own visual region. "
        "A wrapped selection here should preserve every intended word and should never bleed into the neighboring column. "
        "The anchor records text identity and geometry together."
    )
    right = (
        "Right-column discussion remains independent. "
        "PDF content order can differ from human reading order, so the demo supports ordinary selections contained within one column "
        "and rejects mappings that cannot be validated."
    )

    gutter = 0.34 * inch
    margin = 0.8 * inch
    column_width = (PAGE_WIDTH - 2 * margin - gutter) / 2
    top = PAGE_HEIGHT - 1.52 * inch

    for x, text in ((margin, left), (margin + column_width + gutter, right)):
        paragraph = Paragraph(text, style)
        _, height = paragraph.wrap(column_width, 4 * inch)
        paragraph.drawOn(pdf, x, top - height)

    pdf.setStrokeColor(HexColor("#eef0f2"))
    pdf.line(PAGE_WIDTH / 2, 1.0 * inch, PAGE_WIDTH / 2, PAGE_HEIGHT - 1.4 * inch)
    pdf.save()


def wrapped_embedded_font() -> None:
    path = OUTPUT_DIR / "anchor-wrapped-embedded-font.pdf"
    font_path = Path("/System/Library/Fonts/Supplemental/Georgia.ttf")
    font_name = "FixtureGeorgia"
    pdfmetrics.registerFont(TTFont(font_name, str(font_path)))

    pdf = canvas.Canvas(str(path), pagesize=letter)
    pdf.setTitle("Anchor fixture - wrapped embedded font")
    draw_header(pdf, "Typography Under Test", "Embedded font, punctuation, and wrapped lines")

    style = ParagraphStyle(
        "embedded",
        fontName=font_name,
        fontSize=12,
        leading=19,
        textColor=INK,
        alignment=TA_LEFT,
    )
    text = (
        "Precise highlighting handles commas, parentheses (including nested ideas), apostrophes, and hyphenated terms. "
        "This deliberately narrow measure forces the sentence to wrap across several visible lines while keeping the selected quotation exact."
    )
    paragraph = Paragraph(text, style)
    width = 4.25 * inch
    _, height = paragraph.wrap(width, 4 * inch)
    paragraph.drawOn(pdf, 0.8 * inch, PAGE_HEIGHT - 1.55 * inch - height)
    pdf.save()


def image_only_scan() -> None:
    path = OUTPUT_DIR / "anchor-image-only-scan.pdf"
    image = Image.new("RGB", (1224, 1584), "#fffdf9")
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((110, 120, 1114, 1460), outline="#d6d3cc", width=3)
    drawing.text((160, 190), "IMAGE-ONLY RESEARCH PAGE", fill="#343434")
    drawing.text(
        (160, 250),
        "This sentence is pixels, not selectable PDF text.",
        fill="#4b4b4b",
    )
    drawing.line((160, 290, 1020, 290), fill="#c7c7c7", width=2)
    image.save(path, "PDF", resolution=144.0)


def ocr_ccitt_scan() -> None:
    path = OUTPUT_DIR / "anchor-ocr-ccitt-scan.pdf"
    image = Image.new("1", (1224, 1584), 1)
    drawing = ImageDraw.Draw(image)
    drawing.rectangle((110, 120, 1114, 1460), outline=0, width=3)
    drawing.text((160, 190), "HYBRID OCR RESEARCH PAGE", fill=0)
    drawing.text(
        (160, 250),
        "The visible page is a CCITT-compressed scan.",
        fill=0,
    )
    drawing.line((160, 290, 1020, 290), fill=0, width=2)

    scan_buffer = BytesIO()
    image.save(scan_buffer, "PDF", resolution=144.0)
    scan_buffer.seek(0)

    overlay_buffer = BytesIO()
    overlay = canvas.Canvas(overlay_buffer, pagesize=letter)
    text = overlay.beginText(0.8 * inch, PAGE_HEIGHT - 1.55 * inch)
    text.setFont("Helvetica", 12)
    text.setTextRenderMode(3)
    text.textLine(
        "The OCR layer remains selectable while the CCITT page image is visible."
    )
    overlay.drawText(text)
    overlay.save()
    overlay_buffer.seek(0)

    scanned_page = PdfReader(scan_buffer).pages[0]
    scanned_page.merge_page(PdfReader(overlay_buffer).pages[0])
    writer = PdfWriter()
    writer.add_page(scanned_page)
    with path.open("wb") as output:
        writer.write(output)


def rotated_page() -> None:
    source = PdfReader(OUTPUT_DIR / "anchor-single-column.pdf")
    writer = PdfWriter()
    writer.add_page(source.pages[0])
    writer.pages[0].rotate(90)
    with (OUTPUT_DIR / "anchor-rotated-page.pdf").open("wb") as output:
        writer.write(output)


def two_page() -> None:
    path = OUTPUT_DIR / "anchor-two-page.pdf"
    pdf = canvas.Canvas(str(path), pagesize=letter)
    for page_number in (1, 2):
        draw_header(
            pdf,
            f"Cross-page Boundary {page_number}",
            "Two-page selection rejection fixture",
        )
        pdf.setFillColor(INK)
        pdf.setFont("Helvetica", 12)
        pdf.drawString(
            0.8 * inch,
            PAGE_HEIGHT - 1.6 * inch,
            f"Selectable evidence on page {page_number} remains page-scoped.",
        )
        pdf.showPage()
    pdf.save()


def password_protected() -> None:
    source_buffer = BytesIO()
    pdf = canvas.Canvas(source_buffer, pagesize=letter)
    draw_header(pdf, "Protected Research", "Password fixture")
    pdf.drawString(
        0.8 * inch,
        PAGE_HEIGHT - 1.6 * inch,
        "This text should never render without the fixture password.",
    )
    pdf.save()
    source_buffer.seek(0)

    writer = PdfWriter()
    writer.append_pages_from_reader(PdfReader(source_buffer))
    writer.encrypt("orchard-fixture")
    with (OUTPUT_DIR / "anchor-password-protected.pdf").open("wb") as output:
        writer.write(output)


def malformed() -> None:
    (OUTPUT_DIR / "anchor-malformed.pdf").write_bytes(
        b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 999 0 R >>\nendobj\n"
    )


if __name__ == "__main__":
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    single_column()
    two_column()
    wrapped_embedded_font()
    image_only_scan()
    ocr_ccitt_scan()
    rotated_page()
    two_page()
    password_protected()
    malformed()
