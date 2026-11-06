#!/usr/bin/env python3
"""Parse a DOCX question bank, preserving Word OMML equations as LaTeX."""
import json, re, sys
from docx import Document
from lxml import etree

M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

def local(el):
    return etree.QName(el).localname if isinstance(el.tag, str) else ""

def child(el, name):
    return next((x for x in el if local(x) == name), None)

def math_token(s):
    for word, cmd in [
        ("arcsin", r"\arcsin"), ("arccos", r"\arccos"), ("arctan", r"\arctan"),
        ("asin", r"\arcsin"), ("acos", r"\arccos"), ("atan", r"\arctan"),
        ("sinh", r"\sinh"), ("cosh", r"\cosh"), ("tanh", r"\tanh"),
        ("sin", r"\sin"), ("cos", r"\cos"), ("tan", r"\tan"), ("sec", r"\sec"),
        ("cot", r"\cot"), ("csc", r"\csc"),
        ("ln", r"\ln"), ("log", r"\log"), ("lim", r"\lim"),
        ("max", r"\max"), ("min", r"\min"), ("exp", r"\exp"),
    ]:
        s = re.sub(r"(?<![A-Za-z\\])" + word + r"(?![A-Za-z])", lambda _: cmd + " ", s)
    return s.replace("−", "-").replace("×", r"\times ").replace("·", r"\cdot ").replace("≤", r"\le ").replace("≥", r"\ge ").replace("≠", r"\ne ").replace("∞", r"\infty ")

def inner(el, exclude=()):
    return "".join(omml(x) for x in el if local(x) not in exclude)

def omml(el):
    t = local(el)
    if t == "t":
        return math_token(el.text or "")
    if t in ("oMath", "oMathPara", "e", "num", "den", "sub", "sup", "deg", "fName", "lim", "mr", "mc", "m", "r"):
        return inner(el)
    if t == "f":
        return r"\frac{" + omml(child(el, "num")) + "}{" + omml(child(el, "den")) + "}"
    if t == "sSup":
        return "{" + omml(child(el, "e")) + "}^{" + omml(child(el, "sup")) + "}"
    if t == "sSub":
        return "{" + omml(child(el, "e")) + "}_{" + omml(child(el, "sub")) + "}"
    if t == "sSubSup":
        return "{" + omml(child(el, "e")) + "}_{" + omml(child(el, "sub")) + "}^{" + omml(child(el, "sup")) + "}"
    if t == "rad":
        e, deg = omml(child(el, "e")), omml(child(el, "deg"))
        return r"\sqrt" + (f"[{deg}]" if deg.strip() else "") + "{" + e + "}"
    if t == "d":
        dpr = child(el, "dPr")
        beg = end = ""
        if dpr is not None:
            for a in dpr:
                if local(a) == "begChr": beg = a.get(f"{{{M}}}val", "")
                if local(a) == "endChr": end = a.get(f"{{{M}}}val", "")
        if not beg and not end: beg, end = "(", ")"
        left = {"(": r"\left(", "[": r"\left[", "{": r"\left\{", "|": r"\left|"}
        right = {")": r"\right)", "]": r"\right]", "}": r"\right\}", "|": r"\right|"}
        return left.get(beg, beg) + inner(el, ("dPr",)) + right.get(end, end)
    if t == "nary":
        npr = child(el, "naryPr")
        symbol = "∫"
        if npr is not None:
            chr_node = child(npr, "chr")
            if chr_node is not None: symbol = chr_node.get(f"{{{M}}}val", symbol)
        symbol = {"∫": r"\int", "∬": r"\iint", "∭": r"\iiint", "∑": r"\sum", "∏": r"\prod", "⋃": r"\bigcup", "⋂": r"\bigcap"}.get(symbol, symbol)
        sub, sup, e = omml(child(el, "sub")), omml(child(el, "sup")), omml(child(el, "e"))
        return symbol + (f"_{{{sub}}}" if sub else "") + (f"^{{{sup}}}" if sup else "") + e
    if t == "func":
        return omml(child(el, "fName")) + omml(child(el, "e"))
    if t == "limLow":
        return omml(child(el, "e")) + r"_{\underset{}{"+omml(child(el, "lim"))+"}}"
    if t == "limUpp":
        return omml(child(el, "e")) + r"^{"+omml(child(el, "lim"))+"}"
    if t == "bar": return r"\overline{" + omml(child(el, "e")) + "}"
    if t == "acc": return r"\widehat{" + omml(child(el, "e")) + "}"
    if t == "groupChr": return r"\underbrace{" + omml(child(el, "e")) + "}"
    if t == "matrix":
        rows = []
        for mr in el:
            if local(mr) == "mr":
                rows.append(" & ".join(omml(mc) for mc in mr if local(mc) == "e"))
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"
    if t == "eqArr":
        return r" \\ ".join(omml(x) for x in el if local(x) == "e")
    if t == "box": return omml(child(el, "e"))
    if t.endswith("Pr") or t == "ctrlPr": return ""
    return inner(el)

def paragraph_text(p):
    parts = []
    for node in p._p:
        kind = local(node)
        if kind == "pPr": continue
        if kind == "oMath": parts.append(r"\(" + omml(node) + r"\)")
        elif kind == "oMathPara": parts.append(r"\[" + omml(node) + r"\]")
        else:
            parts.append("".join((x.text or "") for x in node.iter() if x.tag == f"{{{W}}}t"))
    return "".join(parts).strip()

def parse_docx(path, term):
    doc = Document(path)
    paragraphs = [paragraph_text(p) for p in doc.paragraphs]
    questions, current_type, current = [], None, None
    def finish():
        nonlocal current
        if current is not None:
            questions.append(current)
            current = None
    for raw in paragraphs:
        line = raw.replace("\r", "").strip()
        if not line: continue
        mt = re.match(r"^Dạng\s+(\d+)\s*:", line, re.I)
        if mt:
            finish()
            current_type = int(mt.group(1))
            continue
        mq = re.match(r"^Câu\s+(\d+)\s*[:.]\s*(.*)$", line, re.I)
        if mq:
            finish()
            if current_type is None:
                raise ValueError(f"Gặp câu hỏi trước tiêu đề Dạng: {line[:80]}")
            current = {"id": f"d{current_type}-q{int(mq.group(1))}", "type": current_type,
                       "term": term, "content": mq.group(2).strip(), "options": {},
                       "correct": None, "explanation": ""}
            continue
        if current is None: continue
        # Support several options on a single paragraph separated by tabs.
        pieces = re.split(r"\s+(?=[B-D][.)]\s*)", line)
        for piece in pieces:
            piece = piece.strip()
            ma = re.match(r"^(?:Đáp\s*án|Dap\s*an)\s*[:：-]\s*([A-D])\b", piece, re.I)
            mo = re.match(r"^([A-D])[.)]\s*(.*)$", piece, re.S)
            if ma:
                current["correct"] = ma.group(1).upper()
            elif mo:
                current["options"][mo.group(1)] = mo.group(2).strip()
            elif current["options"]:
                last = next((k for k in "DCBA" if k in current["options"]), None)
                if last: current["options"][last] += "\n" + piece
                else: current["content"] += "\n" + piece
            else:
                current["content"] += "\n" + piece
    finish()
    errors = []
    for q in questions:
        missing = [k for k in "ABCD" if not q["options"].get(k, "").strip()]
        if missing: errors.append(f"{q['id']}: thiếu phương án {','.join(missing)}")
        if q["correct"] not in "ABCD": errors.append(f"{q['id']}: thiếu/sai đáp án")
        if not q["content"].strip(): errors.append(f"{q['id']}: thiếu nội dung")
    if errors:
        raise ValueError(f"File có {len(errors)} lỗi; ví dụ: " + "; ".join(errors[:20]))
    if not questions: raise ValueError("Không tìm thấy câu hỏi.")
    return questions

if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("Cách dùng: parse_docx_bank.py <file.docx> <midterm|final> <output.json>")
        result = parse_docx(sys.argv[1], sys.argv[2])
        with open(sys.argv[3], "w", encoding="utf-8") as output:
            json.dump({"questions": result}, output, ensure_ascii=False)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
