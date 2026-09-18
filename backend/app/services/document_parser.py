import os
from typing import Dict, Any, List, Optional
from app.utils.logging import logger

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
            raise ValueError(f"Unsupported file format: {ext}. Please upload a PDF, DOCX, or XLSX/XLS file.")
    except Exception as e:
        logger.error(f"Error parsing document {filename}: {e}")
        # If parsing fails with specific library, attempt plain text fallback
        if not text_content:
            try:
                text_content = _parse_text(file_path)
            except Exception:
                raise ValueError(f"Failed to read file contents: {str(e)}")

    if not text_content.strip():
        raise ValueError("The uploaded document appears to be empty or contains no readable text.")

    return {
        "filename": filename,
        "extension": ext,
        "text": text_content.strip(),
        "tables": tables_data,
        "size_bytes": os.path.getsize(file_path) if os.path.exists(file_path) else 0
    }

def _parse_pdf(file_path: str) -> tuple[str, List[List[str]]]:
    """Extracts text from PDF using pypdf with fallback."""
    text_parts = []
    try:
        from pypdf import PdfReader
        reader = PdfReader(file_path)
        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
    except ImportError:
        logger.warning("pypdf not available, using raw text fallback")
        return _parse_text(file_path), []
    except Exception as e:
        logger.warning(f"pypdf extraction warning: {e}")
        return _parse_text(file_path), []

    return "\n\n".join(text_parts), []

def _parse_docx(file_path: str) -> tuple[str, List[List[str]]]:
    """Extracts paragraphs and tables from DOCX using python-docx."""
    text_parts = []
    tables_data = []

    try:
        from docx import Document
        doc = Document(file_path)
        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text.strip())

        for table in doc.tables:
            table_rows = []
            for row in table.rows:
                cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                if any(cells):
                    table_rows.append(cells)
                    text_parts.append(" | ".join([c for c in cells if c]))
            if table_rows:
                tables_data.extend(table_rows)
    except ImportError:
        logger.warning("python-docx not available, using raw text fallback")
        return _parse_text(file_path), []

    return "\n".join(text_parts), tables_data

def _parse_xlsx(file_path: str) -> tuple[str, List[List[str]]]:
    """Extracts rows and cells from Excel spreadsheet."""
    text_parts = []
    tables_data = []

    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, data_only=True)
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            text_parts.append(f"=== Sheet: {sheet_name} ===")
            for row in sheet.iter_rows(values_only=True):
                row_vals = []
                for val in row:
                    if val is not None:
                        val_str = str(val).strip()
                        if " 00:00:00" in val_str:
                            val_str = val_str.replace(" 00:00:00", "")
                        row_vals.append(val_str)
                    else:
                        row_vals.append("")
                if any(row_vals):
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
