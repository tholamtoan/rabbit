require('dotenv').config();

const express = require('express');
const cors = require('cors');
const questionBank = require('./questionBank');
const fs = require('node:fs');
const path = require('node:path');
const importedBankPath = path.join(__dirname, 'data', 'question-banks', 'toancc1_iuh.json');
if (fs.existsSync(importedBankPath)) questionBank.toancc1_iuh = JSON.parse(fs.readFileSync(importedBankPath, 'utf8'));
const pricing = require('./config/pricing');
const catalog = require('./config/catalog');
const { pool, initializeDatabase } = require('./config/database');
const { sendOtpEmail } = require('./services/emailService');
const shuffleArray = require('./utils/shuffleArray');
const createAuthRoutes = require('./routes/authRoutes');
const createExamRoutes = require('./routes/examRoutes');
const createAdminRoutes = require('./routes/adminRoutes');
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
app.use(express.json({ limit: '15mb' }));

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

// Giá được lưu trong Neon; file pricing.js chỉ là giá mặc định khi khởi tạo lần đầu.
app.get('/api/config/pricing', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'exam_price'");
    const examPrice = Number(result.rows[0]?.value ?? pricing.EXAM_PRICE);
    return res.json({ examPrice });
  } catch (error) {
    console.error('Không tải được giá:', error.message);
    return res.status(500).json({ message: 'Không tải được cấu hình giá!' });
  }
});

app.use(createAuthRoutes({ pool, sendOtpEmail }));
const requireAuth = createAuthMiddleware(pool);
app.use(createAdminRoutes({ pool, requireAuth, catalog, questionBank }));
app.use(createExamRoutes({ pool, questionBank, pricing, catalog, shuffleArray, requireAuth }));

const PORT = process.env.PORT || 5000;
initializeDatabase()
  .then(async () => {
    const savedBanks = await pool.query('SELECT subject_id, questions FROM question_banks');
    for (const row of savedBanks.rows) questionBank[row.subject_id] = row.questions || [];
    const managedSubjects = await pool.query('SELECT subject_id, university_id, university_name, subject_name FROM managed_subjects ORDER BY created_at');
    for (const row of managedSubjects.rows) {
      if (!catalog[row.university_id]) catalog[row.university_id] = { name: row.university_name, subjects: [] };
      if (!catalog[row.university_id].subjects.some(subject => subject.id === row.subject_id)) {
        catalog[row.university_id].subjects.push({ id: row.subject_id, name: row.subject_name });
      }
    }
    app.listen(PORT, () => console.log(`Server đang chạy tại http://localhost:${PORT}`));
  })
  .catch((error) => {
    console.error('Không thể khởi tạo PostgreSQL:', error.message);
    process.exit(1);
  });
