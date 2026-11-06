#!/usr/bin/env python3
"""Import a DOCX question bank into backend/questionBank.js.

Usage:
  python tools/import_word_bank.py de_thi.docx toancc1_iuh midterm
  python tools/import_word_bank.py de_thi.docx toancc1_iuh final

Requires python-docx. Existing questions for other exam terms and subjects are preserved.
"""
import json
import re
import subprocess
import sys
from pathlib import Path
from docx import Document

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "backend" / "questionBank.js"


def read_existing_bank(path: Path):
    if not path.exists():
        return {}
    js = "const bank=require(process.argv[1]); process.stdout.write(JSON.stringify(bank));"
    try:
        result = subprocess.run(
            ["node", "-e", js, str(path)], check=True, capture_output=True,
            text=True, encoding="utf-8"
        )
        return json.loads(result.stdout or "{}")
    except Exception as exc:
        raise RuntimeError(f"Không đọc được ngân hàng hiện tại {path}: {exc}") from exc


def normalize_question_latex(text: str) -> str:
    # Điều kiện tham số phải đứng ngoài hệ: \end{cases},\quad t>...
    return re.sub(r"(\\end\{cases\})(?!,)(\s*\\quad)", r"\1,\2", text)


def parse_docx(path: Path, term: str):
    doc = Document(str(path))
    questions = []
    current_type = None
    current = None

    def finish_current():
        nonlocal current
        if current is not None:
            questions.append(current)
            current = None

    for paragraph in doc.paragraphs:
        line = paragraph.text.replace("\r", "").strip()
        if not line:
            continue

        type_match = re.match(r"^Dạng\s+(\d+)\s*:", line, re.IGNORECASE)
        if type_match:
            finish_current()
            current_type = int(type_match.group(1))
            continue

        question_match = re.match(r"^Câu\s+(\d+)\s*[:.]\s*(.*)$", line, re.IGNORECASE)
        if question_match:
            finish_current()
            if current_type is None:
                raise ValueError(f"Gặp {line[:40]!r} trước tiêu đề Dạng n:")
            number = int(question_match.group(1))
            current = {
                "id": f"d{current_type}-q{number}",
                "type": current_type,
                "term": term,
                "content": normalize_question_latex(question_match.group(2).strip()),
                "options": {},
                "correct": None,
                "explanation": ""
            }
            continue

        if current is None:
            continue

        # Hỗ trợ các lựa chọn tách thành nhiều paragraph hoặc nằm chung một dòng/tab.
        pieces = re.split(r"\s+(?=[B-D][.)]\s*)", line)
        for piece in pieces:
            option_match = re.match(r"^([A-D])[.)]\s*(.*)$", piece.strip(), re.DOTALL)
            answer_match = re.match(r"^(?:Đáp\s*án|Dap\s*an)\s*[:：-]\s*([A-D])\b", piece.strip(), re.IGNORECASE)
            if answer_match:
                current["correct"] = answer_match.group(1).upper()
            elif option_match:
                label, value = option_match.group(1), option_match.group(2).strip()
                current["options"][label] = value
            elif current.get("options"):
                # Dòng tiếp theo của phương án gần nhất.
                last = next((key for key in "DCBA" if key in current["options"]), None)
                if last:
                    current["options"][last] += "\n" + piece.strip()
                else:
                    current["content"] += "\n" + piece.strip()
            else:
                current["content"] += "\n" + piece.strip()

    finish_current()

    errors = []
    for index, q in enumerate(questions, 1):
        missing = [label for label in "ABCD" if not str(q["options"].get(label, "")).strip()]
        if missing:
            errors.append(f"Câu ở vị trí {index} ({q['id']}): thiếu phương án {', '.join(missing)}")
        if q["correct"] not in "ABCD":
            errors.append(f"Câu ở vị trí {index} ({q['id']}): thiếu/sai dòng Đáp án")
        if not q["content"].strip():
            errors.append(f"Câu ở vị trí {index} ({q['id']}): nội dung câu hỏi trống")

    if errors:
        preview = "\n".join(" - " + item for item in errors[:30])
        more = f"\n ... và {len(errors)-30} lỗi khác" if len(errors) > 30 else ""
        raise ValueError(f"File Word có {len(errors)} lỗi, chưa cập nhật ngân hàng:\n{preview}{more}")
    if not questions:
        raise ValueError("Không tìm thấy câu hỏi nào trong file Word.")
    return questions


def main():
    if len(sys.argv) != 4:
        raise SystemExit(
            "Cách dùng: python tools/import_word_bank.py <file.docx> <subject_id> <midterm|final>\n"
            "Ví dụ: python tools/import_word_bank.py de_thi.docx toancc1_iuh midterm"
        )

    source = Path(sys.argv[1]).resolve()
    subject_id = sys.argv[2].strip()
    term = sys.argv[3].strip().lower()
    if term not in ("midterm", "final"):
        raise SystemExit("Kỳ thi phải là midterm hoặc final.")
    if not source.is_file():
        raise SystemExit(f"Không tìm thấy file Word: {source}")
    if not re.fullmatch(r"[a-zA-Z0-9_-]{2,80}", subject_id):
        raise SystemExit("Mã môn học không hợp lệ.")

    try:
        imported = parse_docx(source, term)
        bank = read_existing_bank(DEFAULT_OUTPUT)
        existing = bank.get(subject_id, [])
        kept = [q for q in existing if q.get("term", "midterm") != term]
        bank[subject_id] = kept + imported

        # Đảm bảo frontend/backend đều nhận được cùng một trường nội dung.
        for q in bank[subject_id]:
            q.setdefault("text", q.get("content", ""))
            q.setdefault("question", q.get("content", q.get("text", "")))
            q.setdefault("title", q.get("content", q.get("text", "")))
            q.setdefault("content", q.get("text", q.get("question", "")))
            q.setdefault("explanation", "")

        DEFAULT_OUTPUT.write_text(
            "// Tự động tạo bởi tools/import_word_bank.py; không sửa tay file này.\n"
            "module.exports = " + json.dumps(bank, ensure_ascii=False, indent=2) + ";\n",
            encoding="utf-8"
        )
        print(f"Đã nhập thành công {len(imported)} câu từ {source.name}.")
        print(f"Môn: {subject_id} | Kỳ thi: {term}")
        print(f"Giữ lại {len(kept)} câu thuộc kỳ thi còn lại.")
        print(f"Tổng ngân hàng môn sau cập nhật: {len(bank[subject_id])} câu.")
        print(f"Đã cập nhật: {DEFAULT_OUTPUT}")
        print("Đã giữ nguyên LaTeX, bao gồm \\\\ xuống dòng trong cases/aligned.")
    except Exception as exc:
        print(f"KHÔNG CẬP NHẬT: {exc}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
