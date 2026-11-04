const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const questionBank = require('./questionBank');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Cấu hình Nodemailer với mật khẩu ứng dụng đã viết liền
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'tholamtoan@gmail.com',
    pass: process.env.GMAIL_APP_PASS || 'vnotcvalfkyauvwg'
  }
});

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
// 1. API GỬI MÃ OTP (CÓ CƠ CHẾ DỰ PHÒNG CHỐNG TIMEOUT)
// ==========================================
app.post('/api/auth/send-otp', async (req, res) => {
  const { username, emailOrPhone, password, confirmPassword, isRegister } = req.body;

  if (!emailOrPhone) {
    return res.status(400).json({ message: 'Vui lòng nhập Email hoặc Số điện thoại!' });
  }

  const cleanContact = emailOrPhone.trim().toLowerCase();

  if (isRegister) {
    if (!username || !password || !confirmPassword) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin đăng ký!' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Mật khẩu nhập lại không khớp! Vui lòng kiểm tra lại.' });
    }
    const cleanUser = username.trim().toLowerCase();
    if (userWallets[cleanUser]) {
      return res.status(400).json({ message: 'Tên tài khoản này đã tồn tại, vui lòng chọn tên khác!' });
    }
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  otpStorage[cleanContact] = {
    otp: otpCode,
    tempData: { username: username?.trim().toLowerCase(), emailOrPhone: cleanContact, password }
  };

  console.log(`[Mã OTP dự phòng cho ${cleanContact}]: ${otpCode}`);

  if (cleanContact.includes('@')) {
    try {
      const mailOptions = {
        from: '"Học cùng Thỏ 🐰" <tholamtoan@gmail.com>',
        to: cleanContact,
        subject: 'Mã xác thực OTP - Học cùng Thỏ',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px;">
            <h2 style="color: #7c3aed;">🐰 Học cùng Thỏ - Mã Xác Thực OTP</h2>
            <p>Mã OTP dùng để xác thực tài khoản của bạn là:</p>
            <div style="background-color: #f3e8ff; color: #6b21a8; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              ${otpCode}
            </div>
          </div>
        `
      };

      // Đặt thời gian chờ tối đa 5 giây cho việc gửi mail, tránh bị treo vô hạn
      await Promise.race([
        transporter.sendMail(mailOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      return res.json({ 
        success: true, 
        message: `Mã OTP đã được gửi đến email ${cleanContact}!` 
      });
    } catch (err) {
      console.log("Cảnh báo: Không gửi được mail qua SMTP, chuyển sang chế độ trả mã trực tiếp:", err.message);
      // Cơ chế dự phòng thông minh: Nếu timeout mạng, vẫn trả về thành công kèm mã test ngay trên màn hình để không bị gián đoạn
      return res.json({ 
        success: true, 
        message: `Hệ thống mạng bị giới hạn gửi mail. Mã OTP test của bạn là: ${otpCode}`,
        debugOtp: otpCode
      });
    }
  } else {
    return res.json({ 
      success: true, 
      message: `Mã OTP đã gửi đến SĐT ${cleanContact}!`,
      debugOtp: otpCode
    });
  }
});

// ==========================================
// 2. API XÁC THỰC OTP & HOÀN TẤT ĐĂNG KÝ
// ==========================================
app.post('/api/auth/verify-register', (req, res) => {
  const { emailOrPhone, otp } = req.body;
  const cleanContact = (emailOrPhone || '').trim().toLowerCase();

  const record = otpStorage[cleanContact];
  if (!record || record.otp !== otp) {
    return res.status(400).json({ message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
  }

  const { username, password } = record.tempData;

  if (userWallets[username]) {
    return res.status(400).json({ message: 'Tên tài khoản này đã tồn tại!' });
  }

  userWallets[username] = {
    username,
    password,
    email: cleanContact.includes('@') ? cleanContact : '',
    phone: !cleanContact.includes('@') ? cleanContact : '',
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
    if (u.username === cleanKey || u.email === cleanKey || u.phone === cleanKey) {
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
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin khôi phục!' });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'Mật khẩu mới nhập lại không khớp!' });
  }

  const cleanContact = emailOrPhone.trim().toLowerCase();
  const record = otpStorage[cleanContact];

  if (!record || record.otp !== otp) {
    return res.status(400).json({ message: 'Mã OTP khôi phục không chính xác hoặc đã hết hạn!' });
  }

  let foundUser = null;
  for (const userKey in userWallets) {
    const u = userWallets[userKey];
    if (u.email === cleanContact || u.phone === cleanContact) {
      foundUser = u;
      break;
    }
  }

  if (!foundUser) {
    return res.status(404).json({ message: 'Không tìm thấy tài khoản liên kết với thông tin này!' });
  }

  foundUser.password = newPassword;
  delete otpStorage[cleanContact];

  res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
});

// Các API trường, môn học, thi và ví giữ nguyên
app.get('/api/universities', (req, res) => {
  const uniList = Object.keys(database).map(key => ({
    id: key,
    name: database[key].name
  }));
  res.json(uniList);
});

app.get('/api/universities/:uniId/subjects', (req, res) => {
  const { uniId } = req.params;
  if (database[uniId]) {
    res.json(database[uniId].subjects);
  } else {
    res.status(404).json({ message: "Không tìm thấy trường!" });
  }
});

app.get('/api/exam/random/:subjectId', (req, res) => {
  const { subjectId } = req.params;
  const bank = questionBank[subjectId];

  if (!bank || bank.length === 0) {
    return res.status(404).json({ message: "Kho câu hỏi môn này đang trống!" });
  }

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

    return {
      id: qId,
      content: q.content ?? q.text ?? q.question ?? '',
      options: displayedOptions
    };
  });

  res.json({
    title: "Đề thi trắc nghiệm ngẫu nhiên",
    durationMinutes: 15,
    questions: clientQuestions,
    _secretKey: answerKey,
    _secretExplanation: explanationKey
  });
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
  const cleanUser = userId.toLowerCase();
  const user = userWallets[cleanUser];
  res.json({ userId: cleanUser, balance: user ? user.balance : 0 });
});

app.post('/api/exam/buy', (req, res) => {
    const { userId, subjectId, price } = req.body;
    const cleanUser = userId.toLowerCase();
    const user = userWallets[cleanUser];
    const currentBalance = user ? user.balance : 0;

    if (currentBalance < price) {
        return res.status(400).json({ success: false, message: "Số dư không đủ!" });
    }
    user.balance -= price;
    res.json({ success: true, message: "Mua đề thi thành công!", newBalance: user.balance });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});