const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const questionBank = require('./questionBank');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Gmail API uses HTTPS (port 443), avoiding Render Free's SMTP port restrictions.
// Required Render environment variables: GMAIL_USER, GMAIL_CLIENT_ID,
// GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getGmailAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const required = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
    error.code = 'GMAIL_CONFIG_MISSING';
    throw error;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || `OAuth token HTTP ${response.status}`);
    error.code = data.error || `OAUTH_HTTP_${response.status}`;
    throw error;
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

async function sendOtpEmail(to, otpCode) {
  const from = process.env.GMAIL_USER;
  const accessToken = await getGmailAccessToken();
  const subject = 'Mã xác thực OTP - Học cùng Thỏ';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px;">
      <h2 style="color: #7c3aed;">🐰 Học cùng Thỏ - Mã Xác Thực OTP</h2>
      <p>Mã OTP dùng để xác thực tài khoản của bạn là:</p>
      <div style="background-color: #f3e8ff; color: #6b21a8; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">${otpCode}</div>
      <p style="color: #6b7280; font-size: 13px;">Mã có hiệu lực trong vòng 3 phút.</p>
    </div>`;
  const mime = [
    `From: =?UTF-8?B?${Buffer.from('Học cùng Thỏ', 'utf8').toString('base64')}?= <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64')
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64Url(mime) }),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `Gmail API HTTP ${response.status}`);
    error.code = data.error?.status || `GMAIL_HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

const userWallets = {
  "thong": { 
    username: "thong",
    password: "123", 
    email: "thong@gmail.com",
    phone: "0912345678",
    balance: 0 
  } 
};

const otpStorage = {};

function shuffleArray(array) {
  let arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const database = {
  "iuh": {
    name: "Đại học Công nghiệp Thành phố Hồ Chí Minh (IUH)",
    subjects: [
      { id: "toancc1_iuh", name: "Toán cao cấp 1", totalQuestionsInBank: 50 }, 
      { id: "toancc2_iuh", name: "Toán cao cấp 2", totalQuestionsInBank: 30 }
    ]
  }
};

// ==========================================
// 1. API GỬI MÃ OTP QUA EMAIL THẬT (CHUẨN BẢO MẬT)
// ==========================================
app.post('/api/auth/send-otp', async (req, res) => {
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
      if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Mật khẩu nhập lại không khớp!' });
      }
      const cleanUser = username.trim().toLowerCase();
      if (userWallets[cleanUser]) {
        return res.status(400).json({ message: 'Tên tài khoản này đã tồn tại!' });
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
app.post('/api/auth/verify-register', (req, res) => {
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

  if (record.otp !== cleanOtp) {
    return res.status(400).json({ message: 'Mã OTP không chính xác!' });
  }

  const { username, password } = record.tempData;

  if (userWallets[username]) {
    return res.status(400).json({ message: 'Tên tài khoản này đã tồn tại!' });
  }

  userWallets[username] = {
    username,
    password,
    email: cleanContact,
    phone: '',
    balance: 0
  };

  delete otpStorage[cleanContact];

  res.json({ success: true, userId: username, balance: 0, message: 'Đăng ký tài khoản thành công!' });
});

// ==========================================
// 3. API ĐĂNG NHẬP
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { loginKey, password } = req.body;
  if (!loginKey || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập thông tin đăng nhập và mật khẩu!' });
  }

  const cleanKey = loginKey.trim().toLowerCase();
  let foundUser = null;

  for (const userKey in userWallets) {
    const u = userWallets[userKey];
    if (u.username === cleanKey || u.email === cleanKey) {
      foundUser = u;
      break;
    }
  }

  if (!foundUser || foundUser.password !== password) {
    return res.status(401).json({ message: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  res.json({ success: true, userId: foundUser.username, balance: foundUser.balance });
});

// ==========================================
// 4. API ĐẶT LẠI MẬT KHẨU
// ==========================================
app.post('/api/auth/reset-password', (req, res) => {
  const { emailOrPhone, otp, newPassword, confirmNewPassword } = req.body;

  if (!emailOrPhone || !otp || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin!' });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'Mật khẩu mới không khớp!' });
  }

  const cleanContact = emailOrPhone.trim().toLowerCase();
  const record = otpStorage[cleanContact];

  if (!record || record.otp !== otp) {
    return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
  }

  let foundUser = null;
  for (const userKey in userWallets) {
    const u = userWallets[userKey];
    if (u.email === cleanContact) {
      foundUser = u;
      break;
    }
  }

  if (!foundUser) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản liên kết!' });
  }

  foundUser.password = newPassword;
  delete otpStorage[cleanContact];

  res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
});

// ==========================================
// 5. API TRƯỜNG & MÔN HỌC & THI & VÍ
// ==========================================
app.get('/api/universities', (req, res) => {
  const uniList = Object.keys(database).map(key => ({ id: key, name: database[key].name }));
  res.json(uniList);
});

app.get('/api/universities/:uniId/subjects', (req, res) => {
  const { uniId } = req.params;
  if (database[uniId]) res.json(database[uniId].subjects);
  else res.status(404).json({ message: "Không tìm thấy trường!" });
});

app.get('/api/exam/random/:subjectId', (req, res) => {
  const { subjectId } = req.params;
  const bank = questionBank[subjectId];
  if (!bank || bank.length === 0) return res.status(404).json({ message: "Kho câu hỏi trống!" });

  const QUESTION_COUNT = 20;
  const selectedQuestions = shuffleArray(bank).slice(0, QUESTION_COUNT);
  const answerKey = {};
  const explanationKey = {};
  const clientQuestions = selectedQuestions.map((q, index) => {
    const qId = q.id || index + 1;
    const originalOptions = Object.entries(q.options || {});
    const shuffledOptions = shuffleArray(originalOptions);
    const displayedOptions = {};
    let displayedCorrect = null;

    shuffledOptions.forEach(([oldLabel, optionContent], optionIndex) => {
      const newLabel = String.fromCharCode(65 + optionIndex);
      displayedOptions[newLabel] = optionContent;
      if (oldLabel === q.correct) displayedCorrect = newLabel;
    });

    answerKey[qId] = displayedCorrect;
    explanationKey[qId] = q.explanation;
    return { id: qId, content: q.content ?? q.text ?? q.question ?? '', options: displayedOptions };
  });

  res.json({ title: "Đề thi ngẫu nhiên", durationMinutes: 15, questions: clientQuestions, _secretKey: answerKey, _secretExplanation: explanationKey });
});

app.post('/api/exam/submit-random', (req, res) => {
  const { userAnswers, secretKey, secretExplanation } = req.body;
  let score = 0;
  const total = Object.keys(secretKey).length;
  const details = [];

  Object.keys(secretKey).forEach(qId => {
    const correctAnswer = secretKey[qId];
    const userAnswer = userAnswers[qId] || "Chưa chọn";
    const isCorrect = userAnswer === correctAnswer;
    if (isCorrect) score += 1;
    details.push({ questionId: qId, userAnswer, correctAnswer, isCorrect, explanation: secretExplanation[qId] });
  });

  res.json({ totalQuestions: total, score, percentage: Math.round((score / total) * 100), details });
});

app.get('/api/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const user = userWallets[userId.toLowerCase()];
  res.json({ userId: userId.toLowerCase(), balance: user ? user.balance : 0 });
});

app.post('/api/exam/buy', (req, res) => {
    const { userId, subjectId, price } = req.body;
    const user = userWallets[userId.toLowerCase()];
    if (!user || user.balance < price) return res.status(400).json({ success: false, message: "Số dư không đủ!" });
    user.balance -= price;
    res.json({ success: true, message: "Mua đề thi thành công!", newBalance: user.balance });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});