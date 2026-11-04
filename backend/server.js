const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const questionBank = require('./questionBank'); // Nhập kho câu hỏi vào
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Cấu hình gửi mail Nodemailer sử dụng App Password Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'tholamtoan@gmail.com',
    pass: process.env.GMAIL_APP_PASS || 'vnotcvalfkyauvwg' // Chuỗi 16 ký tự App Password
  }
});

// Bảng dữ liệu lưu trữ tài khoản học sinh
const userWallets = {
  "thong": { 
    username: "thong",
    password: "123", 
    email: "thong@gmail.com",
    phone: "0912345678",
    balance: 0 
  } 
};

// Kho lưu trữ OTP tạm thời
const otpStorage = {};

// Hàm xáo trộn mảng (Fisher-Yates Shuffle)
function shuffleArray(array) {
  let arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Cấu trúc danh sách Trường và Môn học liên kết với questionBank
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
// 1. API GỬI MÃ OTP QUA EMAIL THẬT (GMAIL SMTP)
// ==========================================
app.post('/api/auth/send-otp', async (req, res) => {
  try {
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

    // Sinh mã OTP ngẫu nhiên 6 chữ số
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Lưu trữ OTP tạm thời
    otpStorage[cleanContact] = {
      otp: otpCode,
      tempData: { username: username?.trim().toLowerCase(), emailOrPhone: cleanContact, password }
    };

    console.log(`[Mã OTP sinh ra cho ${cleanContact}]: ${otpCode}`);

    // Kiểm tra nếu là địa chỉ Email thì gửi qua Nodemailer
    if (cleanContact.includes('@')) {
      const mailOptions = {
        from: '"Học cùng Thỏ 🐰" <tholamtoan2023@gmail.com>',
        to: cleanContact,
        subject: 'Mã xác thực OTP - Học cùng Thỏ',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px;">
            <h2 style="color: #7c3aed;">🐰 Học cùng Thỏ - Mã Xác Thực OTP</h2>
            <p>Mã OTP dùng để xác thực tài khoản của bạn là:</p>
            <div style="background-color: #f3e8ff; color: #6b21a8; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
              ${otpCode}
            </div>
            <p style="color: #6b7280; font-size: 13px;">Mã có hiệu lực trong vài phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai khác.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`=> Đã gửi email OTP thật thành công đến ${cleanContact}`);
      
      return res.json({ 
        success: true, 
        message: `Mã OTP đã được gửi đến email ${cleanContact}! Hãy kiểm tra Hộp thư đến (hoặc thư Rác).` 
      });
    } else {
      // Trường hợp nhập SĐT (Mô phỏng log console nếu chưa dùng Twilio/SMS Gateway)
      return res.json({ 
        success: true, 
        message: `Mã OTP đã gửi đến SĐT ${cleanContact}! (Mã test log: ${otpCode})`,
        debugOtp: otpCode
      });
    }

  } catch (error) {
    console.error("Lỗi gửi mail OTP:", error);
    return res.status(500).json({ 
      message: `Không thể gửi email OTP: ${error.message}. Kiểm tra lại cấu hình App Password!` 
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
// 3. API ĐĂNG NHẬP (HỖ TRỢ TÊN TK, EMAIL HOẶC SĐT)
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
// 4. API XÁC THỰC OTP & ĐẶT LẠI MẬT KHẨU MỚI
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

  res.json({ success: true, message: 'Đổi mật khẩu thành công! Bạn có thể đăng nhập bằng mật khẩu mới.' });
});

// ==========================================
// 5. API TRƯỜNG & MÔN HỌC
// ==========================================
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

// ==========================================
// 6. API TẠO ĐỀ THI NGẪU NHIÊN
// ==========================================
app.get('/api/exam/random/:subjectId', (req, res) => {
  const { subjectId } = req.params;
  const bank = questionBank[subjectId];

  if (!bank || bank.length === 0) {
    return res.status(404).json({ message: "Kho câu hỏi môn này đang trống hoặc chưa cập nhật!" });
  }

  const QUESTION_COUNT = 20;
  if (bank.length < QUESTION_COUNT) {
    return res.status(400).json({
      message: `Ngân hàng hiện chỉ có ${bank.length} câu, chưa đủ ${QUESTION_COUNT} câu để tạo đề.`
    });
  }

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
      originalIndex: index,
      content: q.content ?? q.text ?? q.question ?? '',
      options: displayedOptions
    };
  });

  res.json({
    title: "Đề thi trắc nghiệm ngẫu nhiên (Luyện tập)",
    durationMinutes: 15,
    questions: clientQuestions,
    _secretKey: answerKey,
    _secretExplanation: explanationKey
  });
});

// ==========================================
// 7. API NỘP BÀI CHẤM ĐIỂM
// ==========================================
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

    details.push({
      questionId: qId,
      userAnswer,
      correctAnswer,
      isCorrect,
      explanation: secretExplanation[qId]
    });
  });

  res.json({
    totalQuestions: total,
    score,
    percentage: Math.round((score / total) * 100),
    details
  });
});

// ==========================================
// 8. API NHẬN WEBHOOK TỪ SEPAY
// ==========================================
app.post('/api/sepay-webhook', async (req, res) => {
    try {
        const data = req.body;
        const transferAmount = Number(data.transferAmount) || 0;   
        const content = data.content ? data.content.trim() : "";                 
        
        if (content && content.toUpperCase().includes("NAP")) {
            const matches = content.match(/NAP\s*([a-zA-Z0-9]+)/i);
            
            if (matches && matches[1]) {
                const userId = matches[1].toLowerCase();
                
                if (userWallets[userId]) {
                    userWallets[userId].balance += transferAmount;
                } else {
                    userWallets[userId] = { username: userId, password: "123", balance: transferAmount };
                }
            }
            
            return res.status(200).json({ success: true, message: "Đã xử lý cộng tiền vào ví thành công!" });
        }
        
        return res.status(200).json({ success: true, message: "Bỏ qua giao dịch không khớp cú pháp." });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 9. API KIỂM TRA SỐ DƯ VÍ
// ==========================================
app.get('/api/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const cleanUser = userId.toLowerCase();
  const user = userWallets[cleanUser];
  res.json({ userId: cleanUser, balance: user ? user.balance : 0 });
});

// ==========================================
// 10. API TRƯ TIỀN VÀ MUA ĐỀ THI
// ==========================================
app.post('/api/exam/buy', (req, res) => {
    const { userId, subjectId, price } = req.body;
    const cleanUser = userId.toLowerCase();
    const user = userWallets[cleanUser];
    const currentBalance = user ? user.balance : 0;

    if (currentBalance < price) {
        return res.status(400).json({ 
            success: false, 
            message: `Số dư không đủ! Bạn hiện có ${currentBalance.toLocaleString()}đ, đề thi giá ${price.toLocaleString()}đ.` 
        });
    }

    user.balance -= price;

    res.json({ 
        success: true, 
        message: "Mua đề thi thành công!", 
        newBalance: user.balance 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});