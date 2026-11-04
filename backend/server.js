require('dotenv').config();

const express = require('express');
const cors = require('cors');
const questionBank = require('./questionBank');
const pricing = require('./config/pricing');
const catalog = require('./config/catalog');
const { pool, initializeDatabase } = require('./config/database');
const { sendOtpEmail } = require('./services/emailService');
const shuffleArray = require('./utils/shuffleArray');
const createAuthRoutes = require('./routes/authRoutes');
const createExamRoutes = require('./routes/examRoutes');
const { createAuthMiddleware } = require('./middleware/authMiddleware');

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin không được phép truy cập'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
}));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '100kb' }));

// Basic per-IP throttle for authentication endpoints. Use a shared rate-limit store
// (e.g. Redis) before running multiple backend instances.
const authBuckets = new Map();
app.use('/api/auth', (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = authBuckets.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > bucket.resetAt) { bucket.count = 0; bucket.resetAt = now + 15 * 60 * 1000; }
  bucket.count += 1;
  authBuckets.set(key, bucket);
  if (bucket.count > 60) return res.status(429).json({ message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' });
  next();
});

// Giá công khai chỉ dùng để hiển thị; backend tự áp dụng giá khi mua đề.
app.get('/api/config/pricing', (req, res) => {
  res.json({ examPrice: pricing.EXAM_PRICE });
});

app.use(createAuthRoutes({ pool, sendOtpEmail }));
const requireAuth = createAuthMiddleware(pool);
app.use(createExamRoutes({ pool, questionBank, pricing, catalog, shuffleArray, requireAuth }));

const PORT = process.env.PORT || 5000;
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Không thể khởi tạo PostgreSQL:', error.message);
    process.exit(1);
  });
