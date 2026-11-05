# Quản lý thư mục Giữa kỳ / Cuối kỳ

- Mỗi môn hiển thị hai thư mục: Giữa kỳ và Cuối kỳ.
- Ngân hàng câu hỏi Toán cao cấp 1 hiện có 20 câu được gắn `term: "midterm"` và sẽ xuất hiện trong thư mục Giữa kỳ.
- Thư mục Cuối kỳ đang để trống.
- Toán cao cấp 2 hiện chưa có ngân hàng câu hỏi trong source, nên hai thư mục hiển thị nhưng chưa thể mở đề.
- API tạo đề nhận `?term=midterm` hoặc `?term=final` và chỉ random trong ngân hàng của kỳ tương ứng.
- Giao dịch mua đề ghi rõ Giữa kỳ/Cuối kỳ trong nội dung giao dịch.

Lưu ý: Khi thêm câu hỏi mới, cần gắn `term: "midterm"` hoặc `term: "final"` cho từng câu hỏi. Hiện chưa bổ sung màn hình upload Word và phân loại kỳ thi trong Admin.
