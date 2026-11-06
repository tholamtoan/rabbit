# Quy trình cập nhật ngân hàng câu hỏi từ Word

Từ nay `de_thi.docx` là file nguồn để biên tập đề. Website lấy câu hỏi từ `backend/questionBank.js`, vì vậy sau khi sửa Word cần chạy bộ chuyển đổi để cập nhật ngân hàng trước khi push GitHub.

## Cài đặt một lần trên máy Windows

Mở Terminal tại thư mục gốc `D:\HocCungTho` và chạy:

```powershell
py -m pip install python-docx
```

Máy cần có Node.js (để bộ chuyển đổi đọc và giữ lại dữ liệu kỳ thi còn lại).

## Mỗi lần cập nhật đề

1. Sửa nội dung trong `de_thi.docx` ở thư mục gốc project. Giữ cấu trúc `Dạng n:`, `Câu n:`, bốn lựa chọn `A.`–`D.` và `Đáp án: X`.
2. Chạy một trong hai lệnh tại thư mục gốc:

```powershell
# Cập nhật ngân hàng Giữa kỳ
py tools/import_word_bank.py de_thi.docx toancc1_iuh midterm

# Hoặc cập nhật ngân hàng Cuối kỳ
py tools/import_word_bank.py de_thi.docx toancc1_iuh final
```

3. Script kiểm tra đủ nội dung, 4 phương án và đáp án của từng câu. Nếu có lỗi, script dừng và **không ghi đè ngân hàng hiện tại**. Nếu hợp lệ, script cập nhật `backend/questionBank.js`; dữ liệu kỳ thi còn lại được giữ nguyên.
4. Kiểm tra số câu báo thành công, sau đó commit các file:

```powershell
git add de_thi.docx backend/questionBank.js
git commit -m "Update question bank from Word"
git push origin main
```

Render backend sẽ deploy lại và nạp ngân hàng mới. Nếu chỉ thay nội dung đề thì không cần deploy frontend.

## Lưu ý công thức

- Có thể dùng hệ LaTeX như `\\begin{cases} ... \\ y=... \end{cases}, \quad t>...`.
- Hai dấu gạch chéo `\\` bên trong `cases` là ký hiệu xuống dòng; không xóa một dấu. Bộ hiển thị frontend đã được sửa để giữ nguyên dấu xuống dòng này.
- Đối với môn khác, thay `toancc1_iuh` bằng `subject_id` tương ứng trong `backend/config/catalog.js`.
