from dataclasses import dataclass
from io import BytesIO
from pathlib import PurePath
import re
from zipfile import BadZipFile, ZipFile

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader


MEDIA = {".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
         ".txt": "text/plain", ".md": "text/markdown"}


@dataclass
class Passage:
    text: str
    location: str
    page: int | None = None


def extract(filename: str, body: bytes) -> list[Passage]:
    extension = PurePath(filename).suffix.lower()
    if extension not in MEDIA:
        raise ValueError("Upload a PDF, DOCX, TXT, or Markdown file.")
    if not body:
        raise ValueError("The uploaded file is empty.")
    result = []
    try:
        if extension == ".pdf":
            if not body.startswith(b"%PDF-"):
                raise ValueError("This file is not a valid PDF.")
            reader = PdfReader(BytesIO(body))
            if reader.is_encrypted:
                raise ValueError("Password-protected PDFs are not supported. Upload an unlocked copy.")
            if len(reader.pages) > 500:
                raise ValueError("PDFs may contain at most 500 pages.")
            for index, page in enumerate(reader.pages, 1):
                text = (page.extract_text() or "").strip()
                if not text:
                    if len(page.images):
                        raise ValueError("This PDF contains image-only pages. Upload a text-based copy; OCR is not supported.")
                    # Blank separator pages are valid; keep original page numbers.
                    continue
                result.append(Passage(text, f"Page {index}", index))
        elif extension == ".docx":
            with ZipFile(BytesIO(body)) as archive:
                if sum(item.file_size for item in archive.infolist()) > 100 * 1024 * 1024:
                    raise ValueError("The DOCX expands beyond the processing limit.")
                if "word/document.xml" not in archive.namelist():
                    raise ValueError("This file is not a valid DOCX document.")
            doc = Document(BytesIO(body))
            paragraph = table = 0
            for block in doc.iter_inner_content():
                if isinstance(block, Paragraph):
                    paragraph += 1
                    if block.text.strip():
                        result.append(Passage(block.text.strip(), f"Paragraph {paragraph}"))
                elif isinstance(block, Table):
                    table += 1
                    for row_number, row in enumerate(block.rows, 1):
                        text = " | ".join(cell.text.strip() for cell in row.cells).strip()
                        if text:
                            result.append(Passage(text, f"Table {table}, row {row_number}"))
        else:
            text = body.decode("utf-8-sig")
            if any(ord(char) < 32 and char not in "\n\r\t" for char in text):
                raise ValueError("Text files must contain readable UTF-8 text.")
            for index, paragraph in enumerate(re.split(r"\n\s*\n", text), 1):
                if paragraph.strip():
                    result.append(Passage(paragraph.strip(), f"Paragraph {index}"))
    except ValueError:
        raise
    except (UnicodeError, BadZipFile) as error:
        raise ValueError("The document is corrupt or is not readable UTF-8 text.") from error
    except Exception as error:
        raise ValueError("The document could not be read. Upload an unlocked, valid copy.") from error
    if not result or not any(any(char.isalnum() for char in p.text) for p in result):
        raise ValueError("The document contains no readable text.")
    if sum(len(p.text) for p in result) > 4_000_000:
        raise ValueError("The extracted document exceeds the processing limit.")
    return result


def chunk(passages: list[Passage], tokenizer) -> list[Passage]:
    # Offsets preserve the exact extracted passage, unlike decoding token IDs.
    result = []
    for passage in passages:
        encoding = tokenizer.encode(passage.text, add_special_tokens=False)
        for start in range(0, len(encoding.ids), 340):
            offsets = encoding.offsets[start:start + 400]
            if not offsets:
                break
            text = passage.text[offsets[0][0]:offsets[-1][1]]
            if text.strip():
                result.append(Passage(text, passage.location, passage.page))
            if len(result) > 10000:
                raise ValueError("The document contains too many passages.")
            if start + 400 >= len(encoding.ids):
                break
    return result
