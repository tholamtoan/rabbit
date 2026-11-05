# Quản lý ngân hàng câu hỏi nhiều môn

## Đã bổ sung
- Ngân hàng Toán cao cấp 1 từ `de_thi(20261105-214223).docx`: 530 câu, gắn `type` từ 1 đến 16.
- Đề mặc định Toán cao cấp 1: 20 câu / 60 phút, đúng cơ cấu 16 dạng đã yêu cầu.
- Mỗi tài khoản có lịch sử câu đã làm theo từng môn. Khi tạo đề mới, hệ thống ưu tiên câu chưa xuất hiện; chỉ lặp khi ngân hàng của dạng đó đã dùng hết. Câu nằm trong đề đang làm cũng được loại khỏi lượt tạo đề mới.
- Cấu hình số câu theo từng dạng được lưu trong PostgreSQL/Neon.
- Trang Admin có thể tạo trường/môn mới ngay trên web, không cần sửa `catalog.js`; sau đó upload file JSON cho môn. Dữ liệu danh mục và ngân hàng lưu trong PostgreSQL, không lưu trên filesystem tạm của Render.

## Chuyển file Word thành JSON
Máy chạy script cần Python và `python-docx`:

```bash
pip install python-docx
python tools/convert_docx_bank.py de_thi.docx question_bank.json
```

File JSON có dạng mảng câu hỏi, mỗi câu gồm `id`, `type`, `content`, `options` (A/B/C/D), `correct`, `explanation`.

## Upload trên web
1. Đăng nhập tài khoản quản trị.
2. Mở Trung tâm quản trị → `Upload ngân hàng`.
3. Chọn môn học và file `.json`.
4. Upload sẽ thay thế toàn bộ ngân hàng của môn đang chọn; hãy sao lưu file JSON trước khi thay thế.
5. Vào `Cấu hình đề` để điều chỉnh tổng số câu, thời gian và số câu từng dạng. Tổng số lượng 16 dạng phải bằng tổng số câu.

## Triển khai
- Deploy backend trước để database tự tạo các bảng/cột mới và tải ngân hàng mặc định.
- Sau đó deploy frontend.
- Cần giữ `DATABASE_URL` của Neon ổn định. Ngân hàng upload nằm trong bảng `question_banks`.

Lưu ý: các trường/môn cũ vẫn được nạp từ `backend/config/catalog.js`; trường/môn tạo mới trên Admin được lưu trong PostgreSQL và tự nạp lại khi backend khởi động.
