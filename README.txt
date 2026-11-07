SỬA ĐỒNG BỘ NÚT QUAY LẠI

Đã sửa đúng trên hai file App.jsx và App.css từ bản bạn gửi:
- Nút "Chọn trường khác": thêm mũi tên trái nằm trong vòng tròn.
- Nút "Quay lại danh sách môn": đổi mũi tên chữ lớn thành cùng kiểu vòng tròn.
- Cả hai nút dùng chung một class và kích thước 38x38px, cùng màu/hiệu ứng.
- Không thay đổi chức năng chuyển trang hay các phần code khác.

Cách áp dụng:
Chép đè:
frontend/src/App.jsx
frontend/src/App.css

Sau đó chạy:
git add frontend/src/App.jsx frontend/src/App.css
git commit -m "Unify circular back navigation buttons"
git push origin main
