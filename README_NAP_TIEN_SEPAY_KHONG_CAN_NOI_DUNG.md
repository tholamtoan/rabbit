# Tích hợp nạp tiền SePay không cần nội dung chuyển khoản

## Cách hoạt động
- Học viên nhập số tiền muốn nạp (từ 10.000đ, bội số 1.000đ) và bấm **Tạo mã nạp tiền**.
- Backend tạo đơn có hiệu lực 20 phút và gán số tiền chuyển riêng: số tiền nạp + phần lẻ 1–99đ.
- QR chứa đúng số tiền phải chuyển. Học viên không cần nhập nội dung.
- SePay gọi webhook khi có tiền vào. Backend đối chiếu đúng số tiền, chỉ cộng phần tiền gốc vào ví.
- Mỗi mã giao dịch SePay chỉ được xử lý một lần. Giao dịch không khớp đơn sẽ được lưu để admin đối soát, không tự cộng tiền.

Ví dụ: muốn nạp 100.000đ, QR có thể yêu cầu chuyển 100.037đ. Khi nhận đúng giao dịch, ví chỉ được cộng 100.000đ.

## Cấu hình trên Render (Backend)
Thêm Environment Variables:
- `SEPAY_WEBHOOK_API_KEY`: API Key tạo ở SePay, không đưa vào frontend hoặc GitHub.
- `SEPAY_VA_ACCOUNT`: `96247THOLAMTOAN` (tùy chọn; hiện route trả về giá trị mặc định này nếu bỏ trống).

Deploy backend. Khi backend khởi động, `initializeDatabase()` tự tạo các bảng `deposit_orders` và `sepay_transactions`, đồng thời cập nhật kiểu giao dịch ví.

## Tạo webhook trên SePay
1. Vào SePay → Tích hợp → Webhooks → Thêm webhook.
2. URL: `https://rabbit-backend-68j4.onrender.com/api/webhooks/sepay` (nếu backend Render của bạn dùng URL khác thì thay bằng URL thật).
3. Chọn sự kiện **Có tiền vào** và chọn đúng tài khoản BIDV đang liên kết.
4. Định dạng JSON.
5. Ở Bảo mật, chọn **API Key**, tạo key mới, sao chép key và đặt đúng giá trị vào `SEPAY_WEBHOOK_API_KEY` trên Render.
6. Lưu webhook và dùng chức năng gửi thử. Payload test có `id=0`, backend chủ động bỏ qua giao dịch test để không cộng nhầm tiền.
7. Thực hiện một giao dịch thật số tiền nhỏ để xác nhận đầu-cuối trước khi mở nạp tiền rộng rãi.

## Lưu ý vận hành quan trọng
- Cơ chế này không cần VA riêng cho từng học viên, nhưng phụ thuộc webhook SePay hoạt động và số tiền chuyển chính xác.
- Nếu học viên chuyển sai số tiền, chuyển sau khi đơn hết hạn, hoặc đơn không còn hiệu lực, giao dịch không tự cộng ví. Admin cần kiểm tra giao dịch trong SePay và xử lý thủ công.
- Phần lẻ 1–99đ là mã phân biệt giao dịch, không phải phí. Ví chỉ cộng đúng số tiền gốc người học đã chọn.
- Không bật webhook không xác thực trên môi trường thật. Không đưa `SEPAY_WEBHOOK_API_KEY` vào mã frontend.
- Giao dịch không khớp được lưu trong `sepay_transactions` với `matched_order_id` rỗng để phục vụ đối soát. Chưa có màn hình admin đối soát trong bản này.
- Bản này dùng API Key webhook theo tài liệu SePay. Không tự động cấu hình webhook trên tài khoản SePay; người quản trị vẫn phải tạo webhook và nhập biến môi trường.
