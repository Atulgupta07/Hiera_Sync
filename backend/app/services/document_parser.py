import os
import re
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


def parse_document(file_path: str, filename: str) -> Dict[str, Any]:
    """
    Parses an uploaded academic calendar document (PDF, DOCX, XLSX/XLS)
    and returns extracted text and structural metadata.
    """
    ext = os.path.splitext(filename)[1].lower()
    text_content = ""
    tables_data: List[List[str]] = []

    try:
        if ext == ".pdf":
            text_content, tables_data = _parse_pdf(file_path)
        elif ext in [".docx", ".doc"]:
            text_content, tables_data = _parse_docx(file_path)
        elif ext in [".xlsx", ".xls"]:
            text_content, tables_data = _parse_xlsx(file_path)
        elif ext in [".txt", ".csv"]:
            text_content = _parse_text(file_path)
        else:
            raise ValueError(
                f"Unsupported file format: {ext}. "
                "Please upload a PDF, DOCX, or XLSX/XLS file."
            )
    except Exception as e:
        logger.error(f"Error parsing document {filename}: {e}")
        # If parsing fails with specific library, attempt plain text fallback
        if not text_content:
            try:
                text_content = _parse_text(file_path)
            except Exception:
                raise ValueError(f"Failed to read file contents: {str(e)}")

    if not text_content.strip():
        raise ValueError(
            "The uploaded document appears to be empty or contains no readable text."
        )

    return {
        "filename": filename,
        "extension": ext,
        "text": text_content.strip(),
        "tables": tables_data,
        "size_bytes": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
    }


# ---------------------------------------------------------------------------
# OCR / PDF artifact sanitizer
# Applied BEFORE the text is sent to Gemini so the LLM receives clean input.
# ---------------------------------------------------------------------------
def sanitize_ocr_artifacts(text: str) -> str:
    """
    Cleans common OCR / pdfplumber extraction noise from institutional PDF tables:

    1. Re-join ordinal superscripts that got split onto their own lines:
       "10\\nth"  -> "10th"  |  "3\\nrd" -> "3rd"  |  "1\\nst" -> "1st"
    2. Strip stray year fragments that appear at the start of a cell/line:
       ",2026 Commencement" -> "Commencement"   |   ".2026 " -> ""
    3. Remove isolated trailing commas or dots appended to dates:
       "15 June, 2026," -> "15 June, 2026"
    4. Collapse multiple blank lines to a single newline.
    """
    # 1. Re-join split ordinal suffixes (superscript noise from PDF layout)
    #    Pattern: digit(s) followed by newline then ordinal suffix (st|nd|rd|th)
    text = re.sub(r'(\d+)\n(st|nd|rd|th)\b', r'\1\2', text, flags=re.IGNORECASE)

    # 2. Remove leading stray year fragments like ",2026" or ".2026" at line start
    text = re.sub(r'^[\.,]\s*20\d{2}\s+', '', text, flags=re.MULTILINE)

    # 3. Strip trailing commas/dots after a year  e.g. "August, 2026,"
    text = re.sub(r'(20\d{2})[,\.]+(\\s|$)', r'\1\2', text, flags=re.MULTILINE)

    # 4. Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def _parse_pdf(file_path: str) -> Tuple[str, List[List[str]]]:
    """
    Extracts structured tables and text from PDF using pdfplumber,
    with a robust fallback to pypdf.

    Strategy:
      - Attempt 1: pdfplumber — structured table extraction (preserves rows/cols)
        plus plain-text fallback per page when no table is detected.
      - Attempt 2: pypdf — plain page.extract_text() when pdfplumber is absent
        or raises an exception.
    The parsed_successfully flag gates the fallback so both paths never run
    simultaneously and the function always returns a valid (str, list) tuple.
    """
    text_parts: List[str] = []
    tables_data: List[List[str]] = []
    parsed_successfully = False

    # ── Attempt 1: pdfplumber ──────────────────────────────────────────────
    try:
        import pdfplumber  # noqa: PLC0415  (intentional lazy import for optional dep)

        with pdfplumber.open(file_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                page_header = f"--- Page {page_num} ---"
                page_rows: List[str] = []

                # Structured table extraction (preserves row/column grouping)
                tables = page.extract_tables() or []
                for table in tables:
                    for row in (table or []):
                        if row is None:
                            continue
                        # Normalise cells: replace None with "" and strip whitespace
                        cleaned_row = [
                            str(cell).strip().replace("\n", " ")
                            if cell is not None else ""
                            for cell in row
                        ]
                        non_empty = [c for c in cleaned_row if c]
                        if not non_empty:
                            continue
                        row_str = " | ".join(cleaned_row).strip(" |")
                        if row_str:
                            tables_data.append(cleaned_row)
                            page_rows.append(row_str)

                # Also grab raw page text (catches headers/footers outside tables)
                raw_page_text = page.extract_text(x_tolerance=3, y_tolerance=3) or ""
                if raw_page_text.strip():
                    page_rows.append(raw_page_text.strip())

                if page_rows:
                    text_parts.append(page_header + "\n" + "\n".join(page_rows))

        if text_parts:
            parsed_successfully = True

    except ImportError:
        logger.info("pdfplumber not installed; falling back to pypdf")
    except Exception as e:
        logger.warning(
            f"pdfplumber extraction failed for {file_path}: {e}; falling back to pypdf"
        )

    # ── Attempt 2: pypdf fallback ──────────────────────────────────────────
    if not parsed_successfully:
        try:
            from pypdf import PdfReader  # noqa: PLC0415

            reader = PdfReader(file_path)
            for page_num, page in enumerate(reader.pages, start=1):
                page_header = f"--- Page {page_num} ---"
                page_text = page.extract_text() or ""
                if page_text.strip():
                    text_parts.append(f"{page_header}\n{page_text}")

        except ImportError:
            logger.warning(
                "pypdf not installed either; falling back to raw text read"
            )
            return sanitize_ocr_artifacts(_parse_text(file_path)), []
        except Exception as e:
            logger.error(
                f"pypdf fallback extraction also failed for {file_path}: {e}"
            )
            return sanitize_ocr_artifacts(_parse_text(file_path)), []

    raw_text = "\n\n".join(text_parts) if text_parts else ""
    return sanitize_ocr_artifacts(raw_text), tables_data


def _parse_docx(file_path: str) -> Tuple[str, List[List[str]]]:
    """Extracts paragraphs and tables from DOCX using python-docx."""
    text_parts: List[str] = []
    tables_data: List[List[str]] = []

    try:
        from docx import Document  # noqa: PLC0415

        doc = Document(file_path)
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text.strip())

        for table in doc.tables:
            table_rows: List[List[str]] = []
            for row in table.rows:
                cells = [
                    cell.text.strip().replace("\n", " ") for cell in row.cells
                ]
                if any(cells):
                    table_rows.append(cells)
                    text_parts.append(" | ".join([c for c in cells if c]))
            if table_rows:
                tables_data.extend(table_rows)

    except ImportError:
        logger.warning("python-docx not available, using raw text fallback")
        return _parse_text(file_path), []

    return "\n".join(text_parts), tables_data


def _parse_xlsx(file_path: str) -> Tuple[str, List[List[str]]]:
    """Extracts rows and cells from Excel spreadsheet."""
    text_parts: List[str] = []
    tables_data: List[List[str]] = []

    try:
        import openpyxl  # noqa: PLC0415

        wb = openpyxl.load_workbook(file_path, data_only=True)
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            text_parts.append(f"=== Sheet: {sheet_name} ===")
            for row in sheet.iter_rows(values_only=True):
                row_vals: List[str] = []
                for val in row:
                    if val is not None:
                        val_str = str(val).strip()
                        if " 00:00:00" in val_str:
                            val_str = val_str.replace(" 00:00:00", "")
                        row_vals.append(val_str)
                    else:
                        row_vals.append("")
                if any(row_vals):
                    # Strip trailing empty cells
                    while row_vals and not row_vals[-1]:
                        row_vals.pop()
                    if row_vals:
                        tables_data.append(row_vals)
                        text_parts.append(" | ".join(row_vals))

    except ImportError:
        logger.warning("openpyxl not available, using raw text fallback")
        return _parse_text(file_path), []

    return "\n".join(text_parts), tables_data


def _parse_text(file_path: str) -> str:
    """Fallback plain text or Latin-1 decoder."""
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            with open(file_path, "r", encoding=enc, errors="ignore") as f:
                return f.read()
        except Exception:
            continue
    return ""
