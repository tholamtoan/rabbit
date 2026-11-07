# Sửa luồng hủy đơn nạp và đổi số tiền

## Thay đổi
- Khi đơn nạp đang chờ thanh toán, nút X hoặc bấm ra ngoài modal sẽ gọi API hủy đơn trước khi đóng.
- Có nút “Đổi số tiền nạp” ngay trong màn hình QR. Đơn pending sẽ được hủy trên backend, sau đó hiện lại ô nhập số tiền.
- Backend chỉ cho hủy đơn pending của chính tài khoản đang đăng nhập; đơn đã thanh toán không thể hủy.
- Thêm trạng thái `cancelled` vào database. Nếu tiền chuyển đến mã đơn đã hủy, webhook không tự cộng ví mà đưa giao dịch vào luồng kiểm tra thủ công.
- Đơn đã thanh toán hoặc cần quản trị viên đối soát không có nút đổi số tiền.

## Cập nhật
Giải nén và chép đè vào project, sau đó commit/push để Render deploy cả frontend và backend:

```powershell
git add frontend/src/App.jsx backend/routes/depositRoutes.js backend/config/database.js
git commit -m "Allow cancelling deposit orders and changing amount"
git push origin main
```

Database migration được chạy qua `initializeDatabase()` khi backend khởi động.
