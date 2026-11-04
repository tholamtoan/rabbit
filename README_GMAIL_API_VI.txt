HUONG DAN CAU HINH GMAIL API CHO RENDER
=======================================

Backend da duoc chuyen tu Nodemailer/SMTP sang Gmail API qua HTTPS.
Khong can GMAIL_APP_PASS va khong can mo cong SMTP.

A. TAO OAUTH CREDENTIALS
1. Mo https://console.cloud.google.com/ va tao/chon Google Cloud project.
2. Vao APIs & Services > Library, tim Gmail API va bam Enable.
3. Vao Google Auth Platform > Branding/Audience de cau hinh OAuth consent screen.
   - Chon External neu dung Gmail ca nhan.
   - Neu dang Testing, them dia chi Gmail gui OTP vao Test users.
4. Vao Google Auth Platform > Clients > Create Client.
   - Chon Web application.
   - Authorized redirect URI: https://developers.google.com/oauthplayground
5. Luu Client ID va Client Secret.

B. LAY REFRESH TOKEN
1. Mo https://developers.google.com/oauthplayground
2. Bam nut cai dat (banh rang) > tick Use your own OAuth credentials.
3. Dan Client ID va Client Secret vua tao.
4. O Step 1, nhap scope:
   https://www.googleapis.com/auth/gmail.send
5. Bam Authorize APIs va dang nhap dung Gmail se gui OTP.
6. Bam Exchange authorization code for tokens.
7. Sao chep Refresh token (KHONG phai Access token).

Luu y: Neu OAuth consent screen dang External + Testing, Google co the lam
refresh token het han sau 7 ngay voi scope Gmail. De chay lau dai, can chuyen
app sang In production va tuan thu cac yeu cau xac minh OAuth cua Google neu
Google yeu cau. Khong gui Client Secret hay Refresh Token cho nguoi khac.

C. CAU HINH TREN RENDER
1. Mo Render Dashboard > rabbit-backend > Environment.
2. Them 4 Environment Variables:
   GMAIL_USER             = dia chi Gmail gui OTP
   GMAIL_CLIENT_ID        = OAuth Client ID
   GMAIL_CLIENT_SECRET    = OAuth Client Secret
   GMAIL_REFRESH_TOKEN    = Refresh Token
3. Xoa bien GMAIL_APP_PASS cu neu co.
4. Bam Save Changes. Render se deploy/restart lai service.

D. KIEM TRA
1. Cho service hien Live.
2. Thu dang ky bang mot email ma ban co the kiem tra.
3. Neu loi, mo Render > Logs. Backend se ghi ma loi OAuth/Gmail API (khong ghi
   token). Cac loi cau hinh se duoc phan biet voi loi gui email.

GHI CHU
- Gmail API gui mail qua HTTPS port 443.
- OTP chi duoc luu vao bo nho sau khi Gmail API chap nhan gui thanh cong.
- OTP duoc tao bang bo sinh so ngau nhien bao mat cua Node.js.
- Khong commit file .env, Client Secret hoac Refresh Token len GitHub.
