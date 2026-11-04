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
  if (!stored.startsWith('scrypt$')) return stored === password;
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}
function otpMatches(code, storedHash) {
  const a = Buffer.from(hashOtp(code), 'hex');
  const b = Buffer.from(storedHash || '', 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function cleanEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function cleanUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

module.exports = function createAuthRoutes({ pool, sendOtpEmail }) {
  const router = express.Router();

  // Kiểm tra tên tài khoản/email ngay khi người dùng rời khỏi ô nhập.
  // Đây chỉ là kiểm tra UX; send-otp và verify-register vẫn kiểm tra lại ở backend.
  router.post('/api/auth/check-registration', async (req, res) => {
    try {
      const field = req.body?.field;
      if (field === 'username') {
        const username = cleanUsername(req.body?.value);
        if (!username) return res.status(400).json({ message: 'Vui lòng nhập tên tài khoản!' });
        if (username.length < 6 || username.length > 30 || !/^[a-z0-9_.-]+$/.test(username)) {
          return res.status(400).json({ message: 'Tên tài khoản phải dài 6–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
        }
        const found = await pool.query('SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1', [username]);
        if (found.rowCount) return res.status(409).json({ available: false, message: 'Tên tài khoản đã tồn tại. Vui lòng chọn tên khác!' });
        return res.json({ available: true, message: 'Tên tài khoản có thể sử dụng.' });
      }
      if (field === 'email') {
        const email = cleanEmail(req.body?.value);
        if (!email) return res.status(400).json({ message: 'Vui lòng nhập email!' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ message: 'Email không đúng định dạng!' });
        }
        const found = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (found.rowCount) return res.status(409).json({ available: false, message: 'Email này đã được đăng ký. Vui lòng sử dụng email khác!' });
        return res.json({ available: true, message: 'Email có thể sử dụng.' });
      }
      return res.status(400).json({ message: 'Thông tin kiểm tra không hợp lệ!' });
    } catch (error) {
      console.error('Lỗi kiểm tra đăng ký:', error.message);
      return res.status(500).json({ message: 'Chưa kiểm tra được thông tin. Vui lòng thử lại!' });
    }
  });

  router.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { username, emailOrPhone, password, confirmPassword, isRegister } = req.body || {};
      const purpose = isRegister ? 'register' : 'reset_password';
      const email = cleanEmail(emailOrPhone);
      if (!email) return res.status(400).json({ message: 'Vui lòng nhập email!' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: 'Email không hợp lệ! Vui lòng nhập đúng định dạng email.' });
      }

      let tempData = {};
      if (purpose === 'register') {
        const normalizedUsername = cleanUsername(username);
        if (!normalizedUsername || !password || !confirmPassword) {
          return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin đăng ký!' });
        }
        if (normalizedUsername.length < 6 || normalizedUsername.length > 30 || !/^[a-z0-9_.-]+$/.test(normalizedUsername)) {
          return res.status(400).json({ message: 'Tên tài khoản phải dài 6–30 ký tự, chỉ gồm chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.' });
        }
        if (typeof password !== 'string' || password.length < 6 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
          return res.status(400).json({ message: 'Mật khẩu phải có từ 6 đến 128 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!' });
        }
        if (password !== confirmPassword) return res.status(400).json({ message: 'Mật khẩu nhập lại không khớp!' });

        // Case-insensitive duplicate check gives a clear message before sending OTP.
        const duplicateUser = await pool.query('SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1', [normalizedUsername]);
        if (duplicateUser.rowCount) return res.status(409).json({ message: 'Tên tài khoản đã tồn tại. Vui lòng chọn tên tài khoản khác!' });
        const duplicateEmail = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (duplicateEmail.rowCount) return res.status(409).json({ message: 'Email này đã được đăng ký. Vui lòng sử dụng email khác!' });
        tempData = { username: normalizedUsername, passwordHash: await hashPassword(password) };
      } else {
        const existing = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
        if (!existing.rowCount) return res.status(404).json({ message: 'Email này chưa được đăng ký!' });
      }

      const ip = String(req.ip || req.socket.remoteAddress || 'unknown').slice(0, 100);
      const limits = await pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE email = $1 AND created_at > NOW() - INTERVAL '15 minutes')::int AS email_count,
           COUNT(*) FILTER (WHERE ip = $2 AND created_at > NOW() - INTERVAL '15 minutes')::int AS ip_count,
           MAX(created_at) FILTER (WHERE email = $1) AS last_email_send
         FROM otp_send_events`, [email, ip]
      );
      const stats = limits.rows[0];
      if (Number(stats.email_count) >= 5) return res.status(429).json({ message: 'Email đã yêu cầu quá nhiều mã OTP. Vui lòng thử lại sau 15 phút.' });
      if (Number(stats.ip_count) >= 20) return res.status(429).json({ message: 'Bạn đã gửi quá nhiều yêu cầu OTP. Vui lòng thử lại sau 15 phút.' });
      if (stats.last_email_send && Date.now() - new Date(stats.last_email_send).getTime() < 60_000) {
        const remaining = Math.ceil((60_000 - (Date.now() - new Date(stats.last_email_send).getTime())) / 1000);
        return res.status(429).json({ message: `Vui lòng chờ ${remaining} giây trước khi gửi lại mã OTP.` });
      }

      const otpCode = crypto.randomInt(100000, 1000000).toString();
      await sendOtpEmail(email, otpCode);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO otp_challenges (email, purpose, otp_hash, temp_data, attempts, expires_at, resend_after, created_at)
           VALUES ($1, $2, $3, $4::jsonb, 0, NOW() + INTERVAL '3 minutes', NOW() + INTERVAL '60 seconds', NOW())
           ON CONFLICT (email, purpose) DO UPDATE SET otp_hash = EXCLUDED.otp_hash, temp_data = EXCLUDED.temp_data,
             attempts = 0, expires_at = EXCLUDED.expires_at, resend_after = EXCLUDED.resend_after, created_at = NOW()`,
          [email, purpose, hashOtp(otpCode), JSON.stringify(tempData)]
        );
        await client.query('INSERT INTO otp_send_events (email, ip, purpose) VALUES ($1, $2, $3)', [email, ip, purpose]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }

      return res.json({ success: true, cooldownSeconds: 60, message: `Mã OTP đã được gửi đến email ${email}! Hãy kiểm tra Hộp thư đến hoặc Thư rác (Spam).` });
    } catch (error) {
      console.error('Lỗi gửi OTP:', { code: error.code, message: error.message });
      const isConfigError = error.code === 'GMAIL_CONFIG_MISSING';
      return res.status(502).json({ message: isConfigError ? 'Máy chủ chưa được cấu hình gửi email. Vui lòng liên hệ quản trị viên.' : 'Chưa gửi được mã OTP. Vui lòng thử lại sau ít phút.' });
    }
  });

  router.post('/api/auth/verify-register', async (req, res) => {
    const email = cleanEmail(req.body?.emailOrPhone);
    const otp = typeof req.body?.otp === 'string' ? req.body.otp.trim() : '';
    if (!email || !/^\d{6}$/.test(otp)) return res.status(400).json({ message: 'Email hoặc mã OTP không hợp lệ!' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const challengeResult = await client.query(
        `SELECT otp_hash, temp_data, attempts FROM otp_challenges
         WHERE email = $1 AND purpose = 'register' AND expires_at > NOW() FOR UPDATE`, [email]
      );
      const challenge = challengeResult.rows[0];
      if (!challenge) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Mã OTP đăng ký không tồn tại hoặc đã hết hạn. Hãy gửi mã mới!' }); }
      if (challenge.attempts >= 5) {
        await client.query("DELETE FROM otp_challenges WHERE email = $1 AND purpose = 'register'", [email]);
        await client.query('COMMIT');
        return res.status(429).json({ message: 'Bạn đã nhập sai OTP quá 5 lần. Hãy gửi mã mới!' });
      }
      if (!otpMatches(otp, challenge.otp_hash)) {
        await client.query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = $1 AND purpose = 'register'", [email]);
        await client.query('COMMIT');
        return res.status(400).json({ message: 'Mã OTP không chính xác!' });
      }
      const username = cleanUsername(challenge.temp_data?.username);
      const passwordHash = challenge.temp_data?.passwordHash;
      if (!username || !passwordHash) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Thông tin đăng ký đã hết hạn. Hãy đăng ký lại!' }); }
      const duplicateUser = await client.query('SELECT 1 FROM users WHERE LOWER(username) = $1 LIMIT 1', [username]);
      if (duplicateUser.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Tên tài khoản đã tồn tại. Vui lòng chọn tên khác!' }); }
      const duplicateEmail = await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
      if (duplicateEmail.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ message: 'Email này đã được đăng ký. Vui lòng sử dụng email khác!' }); }

      const created = await client.query(
        `INSERT INTO users (username, email, password, phone, balance) VALUES ($1, $2, $3, '', 0) RETURNING username, balance`,
        [username, email, passwordHash]
      );
      const sessionToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
      await client.query(`INSERT INTO user_sessions (token_hash, username, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')`, [tokenHash, created.rows[0].username]);
      await client.query("DELETE FROM otp_challenges WHERE email = $1 AND purpose = 'register'", [email]);
      await client.query('COMMIT');
      return res.json({ success: true, token: sessionToken, userId: created.rows[0].username, balance: Number(created.rows[0].balance), message: 'Đăng ký tài khoản thành công!' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === '23505') return res.status(409).json({ message: 'Tên tài khoản hoặc email đã được đăng ký. Vui lòng kiểm tra và nhập thông tin khác!' });
      console.error('Lỗi hoàn tất đăng ký:', error.message);
      return res.status(500).json({ message: 'Không thể tạo tài khoản lúc này. Vui lòng thử lại!' });
    } finally { client.release(); }
  });

  router.post('/api/auth/login', async (req, res) => {
    const { loginKey, password } = req.body || {};
    if (typeof loginKey !== 'string' || typeof password !== 'string' || !loginKey.trim() || !password) return res.status(400).json({ message: 'Vui lòng nhập thông tin đăng nhập và mật khẩu!' });
    try {
      const cleanKey = loginKey.trim().toLowerCase();
      const result = await pool.query('SELECT username, email, password, balance FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1', [cleanKey]);
      const user = result.rows[0];
      if (!user || !(await verifyPassword(password, user.password))) return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác!' });
      if (!user.password.startsWith('scrypt$')) await pool.query('UPDATE users SET password = $1 WHERE username = $2', [await hashPassword(password), user.username]);
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('INSERT INTO user_sessions (token_hash, username, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')', [tokenHash, user.username]);
      return res.json({ success: true, token, userId: user.username, balance: Number(user.balance) });
    } catch (error) {
      console.error('Lỗi đăng nhập:', error.message);
      return res.status(500).json({ message: 'Máy chủ đang bận. Vui lòng thử lại!' });
    }
  });

  router.get('/api/auth/session', async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ message: 'Phiên đăng nhập không hợp lệ!' });
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await pool.query(`SELECT u.username, u.balance FROM user_sessions s JOIN users u ON u.username = s.username WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`, [tokenHash]);
      if (!result.rows[0]) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn!' });
      return res.json({ success: true, userId: result.rows[0].username, balance: Number(result.rows[0].balance) });
    } catch (error) {
      console.error('Lỗi khôi phục phiên:', error.message);
      return res.status(500).json({ message: 'Không thể khôi phục phiên đăng nhập!' });
    }
  });

  router.post('/api/auth/logout', async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
    }
    return res.json({ success: true });
  });

  router.post('/api/auth/reset-password', async (req, res) => {
    const { emailOrPhone, otp, newPassword, confirmNewPassword } = req.body || {};
    const email = cleanEmail(emailOrPhone);
    const cleanOtp = typeof otp === 'string' ? otp.trim() : '';
    if (!email || !/^\d{6}$/.test(cleanOtp) || typeof newPassword !== 'string' || typeof confirmNewPassword !== 'string') return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin hợp lệ!' });
    if (newPassword.length < 6 || newPassword.length > 128 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) return res.status(400).json({ message: 'Mật khẩu mới phải có từ 6 đến 128 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt!' });
    if (newPassword !== confirmNewPassword) return res.status(400).json({ message: 'Mật khẩu mới không khớp!' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query("SELECT otp_hash, attempts FROM otp_challenges WHERE email = $1 AND purpose = 'reset_password' AND expires_at > NOW() FOR UPDATE", [email]);
      const challenge = found.rows[0];
      if (!challenge) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' }); }
      if (challenge.attempts >= 5) {
        await client.query("DELETE FROM otp_challenges WHERE email = $1 AND purpose = 'reset_password'", [email]);
        await client.query('COMMIT');
        return res.status(429).json({ message: 'Bạn đã nhập sai OTP quá 5 lần. Hãy gửi mã mới!' });
      }
      if (!otpMatches(cleanOtp, challenge.otp_hash)) {
        await client.query("UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = $1 AND purpose = 'reset_password'", [email]);
        await client.query('COMMIT');
        return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
      }
      const updated = await client.query('UPDATE users SET password = $1 WHERE LOWER(email) = $2 RETURNING username', [await hashPassword(newPassword), email]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy tài khoản liên kết!' }); }
      await client.query('DELETE FROM user_sessions WHERE username = $1', [updated.rows[0].username]);
      await client.query("DELETE FROM otp_challenges WHERE email = $1 AND purpose = 'reset_password'", [email]);
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Lỗi đổi mật khẩu:', error.message);
      return res.status(500).json({ message: 'Không thể đổi mật khẩu lúc này!' });
    } finally { client.release(); }
  });

  return router;
};
