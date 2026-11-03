import json
import os
import re
import sys
from docx import Document


def clean_latex(text):
    """Chuan hoa LaTeX, giu nguyen noi dung cong thuc."""
    if not text:
        return ""

    text = text.strip()

    commands = [
        "frac", "left", "right", "sqrt", "int", "pi", "sin",
        "cos", "tan", "lim", "sum", "prod", "cdot", "times",
        "begin", "end", "mathrm", "text", "overline", "underline",
        "infty", "alpha", "beta", "theta", "Delta", "prime",
        "log", "ln", "ge", "le", "neq", "rightarrow", "partial"
    ]

    for cmd in commands:
        text = text.replace("\\\\" + cmd, "\\" + cmd)

    for token in [r"\[", r"\]", r"\(", r"\)"]:
        text = text.replace("\\" + token, token)

    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def is_question_start(text):
    return bool(re.match(r"^\s*Câu\s*\d+\s*[:.]", text, re.IGNORECASE))


def parse_option_line(text):
    """
    Nhan dang phuong an bat dau bang A./A) ... .
    Tra ve (nhan, noi_dung) hoac None.
    """
    match = re.match(r"^\s*([A-D])[.)]\s*(.*)$", text, re.DOTALL)
    if not match:
        return None
    return match.group(1), match.group(2).strip()


def parse_answer_line(text):
    """Nhan dang dong dap an rieng: Dap an: C / Đáp án: C."""
    match = re.match(
        r"^\s*(?:Đáp\s*án|Dap\s*an)\s*[:：-]\s*([A-D])\s*[.!]?\s*$",
        text,
        re.IGNORECASE
    )
    return match.group(1).upper() if match else None


def remove_answer_text(text):
    """Phong truong hop dong dap an bi dinh vao cuoi phuong an."""
    text = re.sub(
        r"(?i)\s*(?:Đáp\s*án|Dap\s*an)\s*[:：-]\s*[A-D]\b\s*[.!]?\s*$",
        "",
        text
    )
    return text.strip()


def parse_docx_final_clean(
    docx_path="de_thi.docx",
    output_js_path="backend/questionBank.js"
):
    print(f"Dang doc file Word: {docx_path}")

    if not os.path.isfile(docx_path):
        print(f"LOI: Khong tim thay file '{docx_path}'.")
        return False

    doc = Document(docx_path)

    # QUAN TRONG: giu tung paragraph rieng, KHONG gom thanh chuoi roi xoa newline.
    paragraphs = []
    ignored = ["SBD/Mã SV", "Kỳ thi:", "Môn thi:", "Bộ đề số:", "facebook.com"]

    for paragraph in doc.paragraphs:
        text = paragraph.text.strip()
        if not text:
            continue
        if any(word.lower() in text.lower() for word in ignored):
            continue
        paragraphs.append(text)

    # Chia tai lieu thanh cac khoi cau hoi.
    question_blocks = []
    current = []

    for line in paragraphs:
        if is_question_start(line):
            if current:
                question_blocks.append(current)
            current = [line]
        elif current:
            current.append(line)

    if current:
        question_blocks.append(current)

    print(f"Tim thay {len(question_blocks)} cau hoi.")

    questions = []
    errors = []

    for index, block_lines in enumerate(question_blocks, start=1):
        question_id = index
        question_text = re.sub(
            r"^\s*Câu\s*\d+\s*[:.]\s*",
            "",
            block_lines[0],
            flags=re.IGNORECASE
        ).strip()

        options = {"A": "", "B": "", "C": "", "D": ""}
        correct = None
        explanation_lines = []
        current_option = None
        in_explanation = False

        expanded_lines = []
        for raw_line in block_lines[1:]:
            # Mot so file Word dat A, B, C, D tren cung mot dong bang tab.
            # Tach tai tab truoc nhan phuong an B/C/D.
            pieces = re.split(r"\t+(?=[B-D][.)]\s*)", raw_line)
            expanded_lines.extend(piece.strip() for piece in pieces if piece.strip())

        for line in expanded_lines:
            # Phan loi giai khong duoc dua vao noi dung cau hoi/dap an.
            if line.strip().lower().startswith(("bài làm", "bai lam", "tự luận:", "tu luan:", "casio:")):
                in_explanation = True
                if line.strip().lower().startswith(("bài làm", "bai lam")):
                    explanation_lines.append(line)
                continue

            if in_explanation:
                explanation_lines.append(line)
                continue

            answer = parse_answer_line(line)
            if answer:
                correct = answer
                current_option = None
                continue

            option = parse_option_line(line)
            if option:
                label, value = option
                current_option = label
                options[label] = remove_answer_text(value)
                continue

            # Noi tiep dong cong thuc neu Word xuong dong trong cung phuong an.
            if current_option:
                options[current_option] += "\n" + remove_answer_text(line)
            else:
                question_text += "\n" + line

        # Don dep noi dung, khong de dong dap an lot vao phuong an.
        for label in options:
            options[label] = clean_latex(remove_answer_text(options[label]))

        question_text = clean_latex(remove_answer_text(question_text))

        missing = [label for label, value in options.items() if not value]
        if missing:
            errors.append(
                f"Cau {question_id}: thieu phuong an {', '.join(missing)}."
            )

        if correct not in ("A", "B", "C", "D"):
            errors.append(
                f"Cau {question_id}: khong tim thay dong 'Dap an: X'."
            )

        questions.append({
            "id": question_id,
            "text": question_text,
            "question": question_text,
            "title": question_text,
            "content": question_text,
            "options": options,
            "correct": correct,
            "explanation": "\n".join(explanation_lines).strip()
        })

    if errors:
        print("\nKHONG CAP NHAT FILE questionBank.js vi co loi:")
        for error in errors:
            print(" - " + error)
        return False

    if not questions:
        print("LOI: Khong doc duoc cau hoi nao.")
        return False

    output_dir = os.path.dirname(output_js_path)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    formatted = json.dumps(questions, ensure_ascii=False, indent=4)
    js_content = (
        "// Du lieu cau hoi tu file Word - tu dong tao\n"
        "const questionBank = {\n"
        '  "toancc1_iuh": ' + formatted + "\n"
        "};\n\n"
        "module.exports = questionBank;\n"
    )

    with open(output_js_path, "w", encoding="utf-8") as file:
        file.write(js_content)

    print("\nCAP NHAT THANH CONG!")
    print(f"Tong so cau: {len(questions)}")
    print(f"File dau ra: {output_js_path}")
    print("\nDANH SACH DAP AN:")
    for question in questions:
        print(f"Cau {question['id']}: {question['correct']}")

    return True


if __name__ == "__main__":
    success = parse_docx_final_clean(
        docx_path="de_thi.docx",
        output_js_path="backend/questionBank.js"
    )
    if not success:
        sys.exit(1)
