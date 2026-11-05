# Cập nhật lỗi toàn màn hình và công thức LaTeX

## Thay đổi
- Hiển thị cảnh báo quy chế trước khi người dùng xác nhận vào làm bài.
- Chỉ bắt đầu mở đề sau khi người dùng bấm “Đồng ý, vào làm bài”; thao tác bật fullscreen được gọi trực tiếp từ nút này.
- Gộp các sự kiện `blur`, `visibilitychange`, `fullscreenchange` phát sinh cùng một thao tác trong 1,5 giây để tránh một lần thoát fullscreen bị tính thành nhiều vi phạm.
- Khi vi phạm lần 1 hoặc 2, giữ nguyên bài thi và câu trả lời; hiển thị nút yêu cầu người dùng bật lại fullscreen. Trình duyệt không cho phép website tự bật fullscreen lại nếu không có thao tác bấm của người dùng.
- Đủ 3 lần vi phạm thì hủy lượt thi theo ngưỡng hiện tại.
- Bộ đọc công thức chấp nhận dấu phân cách LaTeX có một hoặc hai dấu `\\` và chuẩn hóa các lệnh bị escape lặp trước khi đưa vào KaTeX.

## Cập nhật
1. Giải nén ZIP.
2. Chép các thư mục `frontend` và `backend` vào dự án GitHub hiện tại, không chép `.env` hoặc `node_modules`.
3. Chạy `git add .`, `git commit -m "Fix fullscreen warning and LaTeX rendering"`, `git push origin main`.
4. Chờ các dịch vụ frontend/backend trên Render deploy xong.

## Kiểm thử
Môi trường đóng gói hiện tại thiếu native optional dependencies của Vite/Rolldown nên không chạy được lệnh build tại đây. Cần xác nhận build sau khi Render cài dependencies từ `package-lock.json`.
