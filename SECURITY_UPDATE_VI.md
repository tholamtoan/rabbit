# Cập nhật bảo mật ví HocCungTho

## Đã sửa
- API xem số dư và mua đề bắt buộc có Bearer session token hợp lệ.
- Backend lấy username từ session đã xác thực, bỏ qua userId do trình duyệt gửi.
- Mua đề khóa dòng tài khoản trong transaction, kiểm tra số dư ở server và ghi lịch sử `wallet_transactions` cùng transaction.
- Endpoint cộng tiền quản trị `/api/admin/wallet/credit` mặc định bị khóa nếu chưa cấu hình `ADMIN_USERNAMES`.
- Mật khẩu đăng ký/đổi mật khẩu được hash bằng scrypt (salt riêng, so sánh constant-time). Tài khoản cũ lưu plaintext sẽ được nâng cấp hash ngay sau lần đăng nhập thành công.
- Thêm giới hạn 5 lần nhập sai OTP cho mỗi mã.

## Cấu hình Render
Giữ nguyên `DATABASE_URL` và các biến Gmail. Nếu cần bật API cộng tiền admin, thêm biến:
`ADMIN_USERNAMES=ten_tai_khoan_admin`

Có thể liệt kê nhiều tài khoản, phân cách bằng dấu phẩy. Chỉ cấu hình username mà mày kiểm soát. Nếu không thêm biến này, endpoint cộng tiền luôn trả 403.

## Database
Khi backend khởi động, nó tự tạo bảng `wallet_transactions` nếu chưa có. Không xóa bảng cũ. Giao dịch mua đề mới sẽ ghi lịch sử vào bảng này.

## Cần kiểm tra sau deploy
1. Đăng nhập bằng tài khoản hiện tại.
2. F5 và kiểm tra phiên vẫn hợp lệ.
3. Mở DevTools/Network hoặc gọi API `/api/wallet` không có token: phải nhận 401.
4. Gọi `/api/exam/buy` không có token: phải nhận 401.
5. Mua đề khi đủ tiền: số dư giảm đúng giá và có một dòng `exam_purchase` trong `wallet_transactions`.
6. Tài khoản thường gọi `/api/admin/wallet/credit`: phải nhận 403.

Lưu ý: hệ thống chấm điểm hiện tại vẫn gửi đáp án đúng từ backend xuống trình duyệt; điều này có thể bị khai thác để gian lận điểm, nhưng không cấp thêm tiền ví. Cần một đợt sửa riêng để chấm điểm hoàn toàn ở server.
