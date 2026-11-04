const express = require('express');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  if (!stored.startsWith('scrypt$')) return stored === password; // legacy plaintext; upgraded after successful login
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

module.exports = function createAuthRoutes({ pool, sendOtpEmail, otpStorage }) {
  const router = express.Router();
  router.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { username, emailOrPhone, password, confirmPassword, isRegister } = req.body;
  
      if (!emailOrPhone) {
        return res.status(400).json({ message: 'Vui lòng nhập Email!' });
      }
  
      const cleanContact = emailOrPhone.trim().toLowerCase();
  
      if (!cleanContact.includes('@') || !cleanContact.includes('.')) {
        return res.status(400).json({ message: 'Email không hợp lệ! Vui lòng nhập đúng định dạng email.' });
      }
  
      if (isRegister) {
        if (!username || !password || !confirmPassword) {
          return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin đăng ký!' });
        }
        if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự!' });
      }
      if (password !== confirmPassword) {
          return res.status(400).json({ message: 'Mật khẩu nhập lại không khớp!' });
        }
        const cleanUser = username.trim().toLowerCase();
        const duplicate = await pool.query(
          'SELECT username FROM users WHERE username = $1 OR email = $2 LIMIT 1',
          [cleanUser, cleanContact]
        );
        if (duplicate.rowCount) {
          return res.status(400).json({ message: 'Tên tài khoản hoặc email này đã được đăng ký!' });
        }
      } else {
        const existing = await pool.query('SELECT username FROM users WHERE email = $1 LIMIT 1', [cleanContact]);
        if (!existing.rowCount) {
          return res.status(404).json({ message: 'Email này chưa được đăng ký!' });
        }
      }
  
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const expiresAt = Date.now() + 3 * 60 * 1000;
  
      // Do not store an OTP until Gmail confirms that the message was accepted.
      await sendOtpEmail(cleanContact, otpCode);
  
      otpStorage[cleanContact] = {
        otp: otpCode,
        expiresAt,
        tempData: { username: username?.trim().toLowerCase(), emailOrPhone: cleanContact, password }
      };
  
      return res.json({ 
        success: true, 
        message: `Mã OTP đã được gửi đến email ${cleanContact}! Hãy kiểm tra Hộp thư đến hoặc Thư rác (Spam).` 
      });
  
    } catch (error) {
      console.error('Lỗi Gmail API khi gửi OTP:', {
        code: error.code,
        status: error.status,
        message: error.message
      });
      const isConfigError = error.code === 'GMAIL_CONFIG_MISSING';
      return res.status(502).json({
        message: isConfigError
          ? 'Máy chủ chưa được cấu hình gửi email. Vui lòng liên hệ quản trị viên.'
          : 'Chưa gửi được mã OTP do kết nối dịch vụ email gặp sự cố. Vui lòng thử lại sau ít phút.'
      });
    }
  });
  
  // ==========================================
  // 2. API XÁC THỰC OTP & HOÀN TẤT ĐĂNG KÝ
  // ==========================================
  router.post('/api/auth/verify-register', async (req, res) => {
    const { emailOrPhone, otp } = req.body;
    const cleanContact = (emailOrPhone || '').trim().toLowerCase();
    const cleanOtp = (otp || '').trim();
  
    const record = otpStorage[cleanContact];
    if (!record) {
      return res.status(400).json({ message: 'Không tìm thấy thông tin yêu cầu OTP cho email này!' });
    }
  
    if (Date.now() > record.expiresAt) {
      delete otpStorage[cleanContact];
      return res.status(400).json({ message: 'Mã OTP đã hết hạn (quá 3 phút).' });
    }
  
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) { delete otpStorage[cleanContact]; return res.status(429).json({ message: 'Bạn đã nhập sai OTP quá 5 lần. Hãy gửi mã mới!' }); }
    if (record.otp !== cleanOtp) {
      return res.status(400).json({ message: 'Mã OTP không chính xác!' });
    }
  
    const { username, password } = record.tempData;
  
    try {
      const result = await pool.query(
        `INSERT INTO users (username, email, password, phone, balance)
         VALUES ($1, $2, $3, '', 0)
         RETURNING username, balance`,
        [username, cleanContact, await hashPassword(password)]
      );
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await pool.query(
        `INSERT INTO user_sessions (token_hash, username, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [tokenHash, result.rows[0].username]
      );
      delete otpStorage[cleanContact];
      return res.json({ success: true, token: sessionToken, userId: result.rows[0].username, balance: Number(result.rows[0].balance), message: 'Đăng ký tài khoản thành công!' });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ message: 'Tên tài khoản hoặc email này đã được đăng ký!' });
      }
      console.error('Lỗi lưu tài khoản:', error.message);
      return res.status(500).json({ message: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại!' });
    }
  });
  
  // ==========================================
  // 3. API ĐĂNG NHẬP
  // ==========================================
  router.post('/api/auth/login', async (req, res) => {
    const { loginKey, password } = req.body;
    if (!loginKey || !password) {
      return res.status(400).json({ message: 'Vui lòng nhập thông tin đăng nhập và mật khẩu!' });
    }
    try {
      const cleanKey = loginKey.trim().toLowerCase();
      const result = await pool.query(
        'SELECT username, email, password, balance FROM users WHERE username = $1 OR email = $1 LIMIT 1',
        [cleanKey]
      );
      const foundUser = result.rows[0];
      if (!foundUser || !(await verifyPassword(password, foundUser.password))) {
        return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác!' });
      }
      if (!foundUser.password.startsWith('scrypt$')) {
        await pool.query('UPDATE users SET password = $1 WHERE username = $2', [await hashPassword(password), foundUser.username]);
      }
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await pool.query(
        `INSERT INTO user_sessions (token_hash, username, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
        [tokenHash, foundUser.username]
      );
      return res.json({ success: true, token: sessionToken, userId: foundUser.username, balance: Number(foundUser.balance) });
    } catch (error) {
      console.error('Lỗi đăng nhập:', error.message);
      return res.status(500).json({ message: 'Máy chủ đang bận. Vui lòng thử lại!' });
    }
  });
  
  // Restore a persistent login session after refresh/reopening the browser.
  router.get('/api/auth/session', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ!' });
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await pool.query(
        `SELECT u.username, u.balance FROM user_sessions s
         JOIN users u ON u.username = s.username
         WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
        [tokenHash]
      );
      if (!result.rows[0]) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn!' });
      return res.json({ success: true, userId: result.rows[0].username, balance: Number(result.rows[0].balance) });
    } catch (error) {
      console.error('Lỗi khôi phục phiên:', error.message);
      return res.status(500).json({ message: 'Không thể khôi phục phiên đăng nhập!' });
    }
  });
  
  router.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
    }
    return res.json({ success: true });
  });
  
  // ==========================================
  // 4. API ĐẶT LẠI MẬT KHẨU
  // ==========================================
  router.post('/api/auth/reset-password', async (req, res) => {
    const { emailOrPhone, otp, newPassword, confirmNewPassword } = req.body;
  
    if (!emailOrPhone || !otp || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin!' });
    }
  
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 8 ký tự!' });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: 'Mật khẩu mới không khớp!' });
    }
  
    const cleanContact = emailOrPhone.trim().toLowerCase();
    const record = otpStorage[cleanContact];
  
    if (!record || Date.now() > record.expiresAt) {
      delete otpStorage[cleanContact];
      return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
    }
    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) { delete otpStorage[cleanContact]; return res.status(429).json({ message: 'Bạn đã nhập sai OTP quá 5 lần. Hãy gửi mã mới!' }); }
    if (record.otp !== otp) return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
  
    try {
      const updated = await pool.query(
        'UPDATE users SET password = $1 WHERE email = $2 RETURNING username',
        [await hashPassword(newPassword), cleanContact]
      );
      if (!updated.rowCount) {
        return res.status(404).json({ message: 'Không tìm thấy tài khoản liên kết!' });
      }
      // Revoke every active session after password reset.
      await pool.query('DELETE FROM user_sessions WHERE username = $1', [updated.rows[0].username]);
      delete otpStorage[cleanContact];
      return res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
      console.error('Lỗi đổi mật khẩu:', error.message);
      return res.status(500).json({ message: 'Không thể đổi mật khẩu lúc này!' });
    }
  });
  return router;
};
