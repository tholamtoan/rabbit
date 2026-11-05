# Cập nhật QR nạp tiền: lưu ảnh và sao chép mã đơn

## Thay đổi
- Thêm nút **Lưu ảnh QR** cạnh mã QR. Trình duyệt sẽ thử tải PNG về thiết bị. Nếu máy chủ ảnh không cho tải trực tiếp do chính sách CORS, trang sẽ mở ảnh để người dùng nhấn giữ (điện thoại) hoặc lưu ảnh (máy tính).
- Thêm nút **Sao chép mã đơn** để xử lý trường hợp ứng dụng ngân hàng quét QR nhưng không tự điền nội dung chuyển khoản.
- Hướng dẫn trên giao diện đã nói rõ: QR thường mang sẵn số tiền và nội dung, nhưng tùy ứng dụng ngân hàng có thể không tự nhận nội dung. Người dùng phải kiểm tra và nếu trống thì dán mã đơn trước khi xác nhận.
- Đồng hồ đếm ngược hiệu lực 20 phút vẫn được giữ nguyên.

## Lưu ý vận hành
QR không thể bảo đảm mọi ứng dụng ngân hàng đều tự điền nội dung. Học viên phải kiểm tra đúng tài khoản nhận, số tiền và mã đơn trước khi chuyển. Nếu mã đơn không được ghi vào nội dung giao dịch ngân hàng, webhook không thể tự ghép đơn; giao dịch cần admin đối soát thủ công.

## Cập nhật
Giải nén và chép đè mã nguồn vào dự án, sau đó:

```bash
git add .
git commit -m "Add save QR and copy deposit code"
git push origin main
```

Frontend sẽ cần deploy lại trên Render. Không cần thay đổi Environment Variables.

## Kiểm thử
Đã rà soát thay đổi JSX bằng kiểm tra mã nguồn thủ công. Không chạy được `npm run build` trong môi trường tạo file vì `npm ci` không hoàn tất trong thời gian cho phép; cần xác nhận build trên máy phát triển hoặc Render trước khi mở nạp tiền cho học viên.
