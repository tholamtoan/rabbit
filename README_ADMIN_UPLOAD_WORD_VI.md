# Upload ngân hàng câu hỏi bằng quyền Admin

## Cách sử dụng trên website
1. Đăng nhập bằng tài khoản có vai trò Admin hoặc Super Admin.
2. Mở **Trung tâm quản trị → Upload ngân hàng**.
3. Chọn môn học, kỳ thi (Giữa kỳ/Cuối kỳ), rồi chọn file `.docx`.
4. Bấm **Kiểm tra và xem trước**. Hệ thống đọc cả công thức Equation của Microsoft Word (OMML), kiểm tra số câu, nội dung, đủ A–D và đáp án.
5. Xem số câu mới, câu đã sửa, câu giữ nguyên và câu bị bỏ. Chỉ bấm **Xác nhận cập nhật ngân hàng** khi thông tin đúng.

## Dữ liệu và an toàn
- File upload chỉ thay ngân hàng của đúng môn và đúng kỳ thi được chọn.
- Ngân hàng được lưu trong PostgreSQL/Neon, không lưu trên filesystem tạm của Render.
- Cấu hình số câu, thời gian làm bài và giao diện thi không bị thay đổi.
- Bản xem trước hết hạn sau 30 phút; nếu parser báo lỗi, ngân hàng cũ không bị thay đổi.
- Khi xuất bản, lịch sử chống lặp của câu không đổi được giữ lại. Lịch sử chỉ được xóa cho câu bị sửa nội dung/đáp án hoặc bị loại khỏi ngân hàng.
- Mỗi tài khoản có lịch sử câu hỏi riêng. Hệ thống ưu tiên câu chưa làm; khi cần dùng lại, ưu tiên câu đã lâu chưa xuất hiện.
- Mỗi lần cập nhật đều ghi nhật ký Admin.

## Yêu cầu máy chủ
Backend dùng Python `python-docx` và `lxml` để đọc DOCX/OMML. Nếu Render đặt **Root Directory** là `backend`, đặt:
- Build Command: `python3 -m pip install -r requirements-import.txt && npm install`
- Start Command: `node server.js`

Nếu Root Directory là thư mục gốc dự án, cần đổi đường dẫn lệnh cài đặt thành `python3 -m pip install -r backend/requirements-import.txt && npm install --prefix backend`; Start Command phải chạy trong thư mục backend (`cd backend && node server.js`).

## Định dạng file Word
- Có tiêu đề `Dạng n:`.
- Mỗi câu bắt đầu bằng `Câu n:`.
- Có đủ bốn phương án `A.` đến `D.`.
- Có dòng `Đáp án: A/B/C/D`.
- Công thức nên được chèn bằng Equation của Word hoặc LaTeX đã hiển thị trong Word. Hệ thống chuyển Equation (OMML) sang LaTeX để frontend hiển thị.

Lưu ý: lần đầu triển khai cần deploy backend để tạo bảng database và API upload; sau đó deploy frontend để hiện tab Upload ngân hàng. Các lần upload đề tiếp theo không cần deploy lại.
