# HocCungTho – Quản lý giá đề thi trong Admin

## Tính năng
- Admin có thể đổi giá đề thi ngay trên website, không cần sửa `pricing.js` hay push GitHub mỗi lần đổi giá.
- Giá thực tế được lưu trong Neon ở bảng `app_settings` với key `exam_price`.
- Backend đọc giá từ Neon khi hiển thị và khi trừ tiền mua đề.
- Mỗi lần thay đổi giá được ghi vào `pricing_audit_log` (giá cũ, giá mới, Admin, thời gian).
- Giá hợp lệ: số nguyên từ 0 đến 100.000.000 VNĐ (0đ là miễn phí).
- Giá mới áp dụng cho các lượt mua sau khi lưu. Tab đang mở khác tự làm mới giá trong tối đa 30 giây hoặc khi quay lại tab.
- API cập nhật giá yêu cầu phiên đăng nhập hợp lệ và username nằm trong `ADMIN_USERNAMES`. Kiểm tra quyền được thực hiện ở backend, không dựa vào nút giao diện.

## Cấu hình bắt buộc trên Render
Trong dịch vụ `rabbit-backend` → Environment, thêm hoặc kiểm tra:

`ADMIN_USERNAMES` = username Admin chính xác, ví dụ `tholamtoan`

Nếu có nhiều Admin, phân cách bằng dấu phẩy: `admin1,admin2`.
Không đặt email nếu backend đang so sánh theo username. Chỉ đưa tài khoản do chủ hệ thống kiểm soát vào danh sách.

Giữ nguyên `DATABASE_URL`, các biến Gmail và `ALLOWED_ORIGINS`.

## Triển khai
1. Giải nén source này vào thư mục dự án (không xóa `.env` cục bộ nếu có).
2. Kiểm tra `git status`; chỉ commit source, không commit `.env`, `node_modules`, `.git` hoặc file ZIP.
3. Push source lên GitHub để Render deploy một lần.
4. Backend tự tạo bảng `app_settings` và `pricing_audit_log` khi khởi động; không cần tạo database mới hoặc chạy SQL thủ công.
5. Đăng xuất rồi đăng nhập lại bằng tài khoản có trong `ADMIN_USERNAMES` để nhận cờ Admin trong phiên.
6. Trên website, chọn **Quản lý giá**, nhập giá mới và lưu.

## Kiểm thử
- Admin: GET/PUT `/api/admin/pricing` thành công với Bearer token hợp lệ.
- Tài khoản thường: GET/PUT `/api/admin/pricing` phải trả 403.
- Giá không nguyên, nhỏ hơn 100 hoặc lớn hơn 100.000.000 phải bị từ chối.
- Sau khi đổi giá, GET `/api/config/pricing` trả giá mới và backend dùng giá đó khi mua đề.

## Ghi chú
- `backend/config/pricing.js` chỉ là giá mặc định để khởi tạo lần đầu; sau đó giá trong Neon là nguồn dữ liệu chính.
- Nếu tài khoản Admin chưa có quyền, kiểm tra `ADMIN_USERNAMES` trên Render và đăng nhập lại.
- Chưa thể xác nhận build frontend hoặc chạy end-to-end trên Render từ môi trường tạo ZIP này. Cần kiểm tra deploy logs và thử bằng một tài khoản Admin cùng một tài khoản thường trước khi mở cho khách.
