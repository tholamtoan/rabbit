# Sửa nhận diện quyền Admin – Học cùng Thỏ

## Thay đổi
- Frontend kiểm tra quyền thật bằng API `GET /api/admin/pricing` sau đăng nhập và khi khôi phục phiên.
- Nếu API trả thành công, giao diện hiện nút `⚙️ Quản lý giá`.
- Nếu backend trả `401/403`, frontend không hiện nút. Các API quản trị vẫn được backend bảo vệ, không dựa vào việc ẩn/hiện nút.
- Không thay đổi dữ liệu người dùng hoặc database.

## Triển khai
1. Giải nén source và đưa các thay đổi lên GitHub (không commit `.env`, `node_modules`, `.git` hoặc file ZIP).
2. Đảm bảo Render backend `rabbit-backend` có `ADMIN_USERNAMES=tholamtoan` trong đúng Environment đang chạy.
3. Deploy backend và frontend mới.
4. Mở website, đăng xuất rồi đăng nhập lại bằng `tholamtoan`, sau đó nhấn `Ctrl + F5`.

## Nếu vẫn không thấy nút
Frontend gọi `GET https://rabbit-backend-68j4.onrender.com/api/admin/pricing` với token đăng nhập. Nếu API trả `403`, biến `ADMIN_USERNAMES` chưa được backend đang chạy nhận (hoặc giá trị username trong DB khác). Nếu API trả `404`, frontend đang trỏ tới backend chưa có route quản trị hoặc URL backend không đúng. Kiểm tra URL API trong `frontend/src/App.jsx` có đúng URL service Render đang chạy hay không.

Lưu ý: Build chưa được xác nhận trong môi trường tạo bản vá vì thư mục `node_modules` trong ZIP không có executable Vite hợp lệ và quá trình cài dependencies bị timeout. Cần để Render chạy build theo cấu hình dự án khi deploy.
