# HocCungTho - cap nhat chinh sach mat khau va ra soat bao mat

## Da sua trong ban nay
- Ten tai khoan moi: 6-30 ky tu; chi chu khong dau, so, dau cham, gach duoi, gach ngang.
- Mat khau dang ky va dat lai: 6-128 ky tu; bat buoc co chu thuong, chu hoa, chu so va ky tu dac biet.
- Hien ghi chu ngay duoi o ten tai khoan va o mat khau tren giao dien dang ky.
- Frontend va backend deu kiem tra; backend la lop quyet dinh cuoi cung.
- Sua regex kiem tra email cua endpoint check-registration de chan dung ky tu khoang trang.
- Mat khau duoc luu bang scrypt (cac tai khoan cu dang plaintext se duoc nang cap hash khi dang nhap thanh cong).

## Cac han che/rui ro chua the tu dong khang dinh da khac phuc
1. Token dang luu o LocalStorage; XSS co the lay token. Can chuyen sang cookie HttpOnly + Secure + SameSite va bo sung CSRF protection.
2. Rate limit dang luu trong RAM; restart hoac nhieu instance co the lam reset bo dem. Can Redis/shared store.
3. Quyen Admin hien duoc cau hinh qua ADMIN_USERNAMES. Chi them username cua tai khoan chu he thong, khong dua gia tri nay ra frontend; nen chuyen sang role trong DB va audit log.
4. Quy trinh mua de tru tien va tao de la hai request tach roi. Neu tao de that bai sau khi tru tien, can co co che refund/idempotency hoac gom thanh mot transaction.
5. Chua co ket qua kiem thu penetration/end-to-end tren Render/Neon; can test truoc khi mo giao dich tien that.
6. Can cau hinh backup Neon, canh bao loi va kiem tra log khong ghi token/OTP/mat khau.

## Ghi chu tuong thich
- Mat khau cu van dang nhap duoc. Quy tac moi ap dung cho dang ky moi va dat lai mat khau.
- Khong can tao lai Neon Database. Giu nguyen DATABASE_URL va cac bien Gmail hien co tren Render.
