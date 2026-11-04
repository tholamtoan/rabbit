const crypto = require('node:crypto');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAuthMiddleware(pool) {
  return async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token.length < 40 || token.length > 200) {
      return res.status(401).json({ message: 'Vui lòng đăng nhập lại!' });
    }
    try {
      const result = await pool.query(
        `SELECT u.username, u.email, u.balance, s.expires_at
         FROM user_sessions s JOIN users u ON u.username = s.username
         WHERE s.token_hash = $1 AND s.expires_at > NOW() LIMIT 1`,
        [hashToken(token)]
      );
      if (!result.rows[0]) return res.status(401).json({ message: 'Phiên đăng nhập đã hết hạn!' });
      req.user = result.rows[0];
      next();
    } catch (error) {
      console.error('Auth middleware:', error.message);
      res.status(500).json({ message: 'Không thể xác thực phiên đăng nhập!' });
    }
  };
}

module.exports = { createAuthMiddleware, hashToken };
