#!/usr/bin/env python3
"""Convert a Word question bank organized by 'Dạng n:' into the admin JSON format.
Usage: python tools/convert_docx_bank.py input.docx output.json
"""
import json, re, sys
from docx import Document

if len(sys.argv) != 3:
    raise SystemExit('Cách dùng: python tools/convert_docx_bank.py de_thi.docx question_bank.json')
source, target = sys.argv[1:]
doc = Document(source)
questions, current_type, current = [], None, None
for paragraph in doc.paragraphs:
    line = paragraph.text.strip()
    if not line:
        continue
    match = re.match(r'Dạng\s+(\d+)\s*:', line, re.I)
    if match:
        current_type = int(match.group(1))
        continue
    match = re.match(r'Câu\s+(\d+)\s*:\s*(.*)', line, re.I)
    if match:
        if current:
            questions.append(current)
        current = {'id': f'd{current_type}-q{int(match.group(1))}', 'type': current_type,
                   'content': match.group(2).strip(), 'options': {}, 'correct': None, 'explanation': ''}
        continue
    if current:
        option = re.match(r'([ABCD])\.\s*(.*)', line)
        answer = re.match(r'Đáp án\s*:\s*([ABCD])', line, re.I)
        if option:
            current['options'][option.group(1)] = option.group(2).strip()
        elif answer:
            current['correct'] = answer.group(1).upper()
        else:
            current['content'] += '\n' + line
if current:
    questions.append(current)

errors = []
for index, question in enumerate(questions, 1):
    if question['type'] is None or set(question['options']) != set('ABCD') or question['correct'] not in 'ABCD':
        errors.append(index)
if errors:
    raise SystemExit(f'Có {len(errors)} câu lỗi/thiếu dạng, đáp án hoặc lựa chọn. Ví dụ vị trí: {errors[:20]}')
with open(target, 'w', encoding='utf-8') as output:
    json.dump(questions, output, ensure_ascii=False, indent=2)
print(f'Đã chuyển {len(questions)} câu hỏi sang {target}')
