# Cập nhật bảo mật HocCungTho v2

## Đã sửa trong bản này
- Đáp án đúng và lời giải không còn gửi xuống trình duyệt khi tạo đề.
- Backend lưu answer key theo từng lượt thi trong PostgreSQL (`exam_attempts`).
- Khi nộp bài, backend tự chấm từ answer key trong DB; không nhận `secretKey` từ client.
- Lượt thi gắn với tài khoản đã xác thực, hết hạn sau 2 giờ và chỉ nộp được một lần.
- Sau khi đặt lại mật khẩu, mọi phiên đăng nhập hiện tại của tài khoản bị thu hồi.
- Thêm giới hạn request cơ bản theo IP cho `/api/auth`, giới hạn JSON 100 KB và một số HTTP security headers.
- CORS chỉ chấp nhận origin được khai báo trong `ALLOWED_ORIGINS` (request không có Origin vẫn được chấp nhận cho health/CLI).

## Bắt buộc cấu hình trên Render
Thêm biến `ALLOWED_ORIGINS` với URL frontend thực tế, ví dụ `https://ten-frontend.onrender.com`. Nếu frontend có nhiều domain, phân tách bằng dấu phẩy. Không để trống, vì khi đó các request trình duyệt có Origin sẽ bị chặn.
Giữ nguyên `DATABASE_URL` và các biến Gmail đang dùng.

## Cập nhật database
Backend tự tạo bảng `exam_attempts` khi khởi động. Không cần xóa bảng hoặc dữ liệu cũ.

## Những việc chưa thể tuyên bố đã xử lý hoàn toàn
- OTP vẫn dùng bộ nhớ RAM; cần chuyển OTP sang PostgreSQL và thêm cooldown riêng theo email/IP trước khi chạy nhiều instance.
- Token hiện vẫn lưu trong LocalStorage; muốn giảm rủi ro XSS cần chuyển sang cookie HttpOnly + Secure + SameSite và rà soát toàn bộ frontend để chống XSS.
- Rate limit hiện lưu trong RAM, chỉ phù hợp một instance; nhiều instance cần Redis hoặc rate-limit store dùng chung.
- Cần kiểm thử thực tế trên Render, Neon và frontend đang deploy.
- Đây là bản tăng cường bảo mật, không phải chứng nhận an toàn tuyệt đối.
