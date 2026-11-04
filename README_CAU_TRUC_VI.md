# HocCungTho - cấu trúc mã nguồn

Bản này tổ chức lại backend theo nhóm chức năng, giữ nguyên các đường dẫn API hiện có để frontend đang dùng không phải đổi URL.

## Backend

- `backend/server.js`: điểm khởi chạy, gắn middleware và các router.
- `backend/config/database.js`: kết nối Neon PostgreSQL và tạo bảng `users`, `user_sessions`.
- `backend/config/pricing.js`: cấu hình giá đề thi (VNĐ). Hiện tại `EXAM_PRICE: 1000`.
- `backend/config/catalog.js`: danh mục trường/môn học.
- `backend/services/emailService.js`: gửi OTP qua Gmail API.
- `backend/services/otpStore.js`: lưu OTP tạm trong bộ nhớ của tiến trình.
- `backend/routes/authRoutes.js`: đăng ký, đăng nhập, phiên đăng nhập, đăng xuất, đặt lại mật khẩu.
- `backend/routes/examRoutes.js`: trường/môn học, đề thi, ví và mua đề.
- `backend/utils/shuffleArray.js`: hàm trộn câu hỏi/đáp án.
- `backend/questionBank.js`: ngân hàng câu hỏi.

## Đổi giá đề thi

Sửa duy nhất `backend/config/pricing.js`, ví dụ:

```js
module.exports = {
  EXAM_PRICE: 2000,
};
```

Giá hiển thị lấy từ `/api/config/pricing`; giá thực tế trừ ví được backend đọc từ cùng cấu hình.

## Biến môi trường Render cần giữ

- `DATABASE_URL`
- `GMAIL_USER`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Không đưa giá trị bí mật vào GitHub hoặc file `.env.example`.

## Lưu ý kỹ thuật trước khi dùng thật

- OTP hiện vẫn lưu trong RAM, vì vậy OTP đang chờ xác minh có thể mất khi backend restart/deploy.
- Mật khẩu hiện đang được xử lý theo cơ chế cũ của dự án (so sánh trực tiếp). Trước khi mở đăng ký công khai, cần chuyển sang bcrypt/argon2 và có quy trình chuyển đổi tài khoản hiện có.
- Endpoint ví/mua đề trong bản nguồn hiện tại vẫn nhận `userId` từ request; cần bổ sung xác thực phiên và phân quyền ở backend trước khi vận hành tiền thật.
- Đây là bản tái cấu trúc module, không phải kiểm toán bảo mật toàn hệ thống.
