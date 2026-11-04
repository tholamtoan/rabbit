const express = require('express');
const cors = require('cors');
const questionBank = require('./questionBank'); // Nhập kho câu hỏi vào
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Bảng dữ liệu giả lập tài khoản và số dư ví học sinh
// Cấu trúc: { "username": { password: "...", balance: 0 } }
const userWallets = {
  "thong": { password: "123", balance: 0 } // Tài khoản mẫu mặc định
};

// Hàm thuật toán xáo trộn ngẫu nhiên mảng (Fisher-Yates Shuffle)
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
// 1. API ĐĂNG KÝ / ĐĂNG NHẬP TÀI KHOẢN
// ==========================================
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ Tên tài khoản và Mật khẩu!' });
  }

  const cleanUser = username.trim().toLowerCase();

  if (userWallets[cleanUser]) {
    return res.status(400).json({ message: 'Tên tài khoản này đã tồn tại, vui lòng chọn tên khác!' });
  }

  userWallets[cleanUser] = {
    password: password,
    balance: 0
  };

  res.json({ success: true, userId: cleanUser, balance: 0, message: 'Đăng ký tài khoản thành công!' });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const cleanUser = (username || '').trim().toLowerCase();

  const user = userWallets[cleanUser];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: 'Tên tài khoản hoặc mật khẩu không chính xác!' });
  }

  res.json({ success: true, userId: cleanUser, balance: user.balance });
});

// ==========================================
// 2. API TRƯỜNG & MÔN HỌC
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
// 3. API TẠO ĐỀ THI NGẪU NHIÊN
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
// 4. API NỘP BÀI CHẤM ĐIỂM
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
// 5. API NHẬN WEBHOOK TỪ SEPAY (CỘNG TIỀN VÀO VÍ)
// ==========================================
app.post('/api/sepay-webhook', async (req, res) => {
    try {
        const data = req.body;
        const transferAmount = Number(data.transferAmount) || 0;   
        const content = data.content ? data.content.trim() : "";                 
        
        console.log(`[SePay Webhook] Nhận giao dịch: ${transferAmount}đ - Nội dung: ${content}`);
        
        if (content && content.toUpperCase().includes("NAP")) {
            const matches = content.match(/NAP\s*([a-zA-Z0-9]+)/i);
            
            if (matches && matches[1]) {
                const userId = matches[1].toLowerCase();
                
                if (!userWallets[userId]) {
                    userWallets[userId] = { password: "123", balance: 0 };
                } else if (typeof userWallets[userId] === 'number') {
                    userWallets[userId] = { password: "123", balance: userWallets[userId] };
                }
                
                userWallets[userId].balance += transferAmount;
                console.log(`=> Đã cộng thành công ${transferAmount}đ vào ví tài khoản: ${userId}. Số dư mới: ${userWallets[userId].balance}đ`);
            }
            
            return res.status(200).json({ success: true, message: "Đã xử lý cộng tiền vào ví thành công!" });
        }
        
        return res.status(200).json({ success: true, message: "Bỏ qua giao dịch không khớp cú pháp." });
        
    } catch (error) {
        console.error("Lỗi xử lý webhook:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 6. API KIỂM TRA SỐ DƯ VÍ
// ==========================================
app.get('/api/wallet/:userId', (req, res) => {
  const { userId } = req.params;
  const cleanUser = userId.toLowerCase();
  
  let balance = 0;
  if (userWallets[cleanUser]) {
    balance = typeof userWallets[cleanUser] === 'object' ? userWallets[cleanUser].balance : userWallets[cleanUser];
  }
  
  res.json({ userId: cleanUser, balance });
});

// ==========================================
// 7. API TRỪ TIỀN VÀ MUA ĐỀ THI
// ==========================================
app.post('/api/exam/buy', (req, res) => {
    const { userId, subjectId, price } = req.body;
    const cleanUser = userId.toLowerCase();

    let currentBalance = 0;
    if (userWallets[cleanUser]) {
      currentBalance = typeof userWallets[cleanUser] === 'object' ? userWallets[cleanUser].balance : userWallets[cleanUser];
    }

    if (currentBalance < price) {
        return res.status(400).json({ 
            success: false, 
            message: `Số dư không đủ! Bạn hiện có ${currentBalance.toLocaleString()}đ, đề thi giá ${price.toLocaleString()}đ. Vui lòng nạp thêm tiền!` 
        });
    }

    if (typeof userWallets[cleanUser] === 'object') {
      userWallets[cleanUser].balance -= price;
    } else {
      userWallets[cleanUser] = { password: "123", balance: currentBalance - price };
    }

    console.log(`[Mua Đề] Tài khoản ${cleanUser} đã mua môn ${subjectId} với giá ${price}đ. Số dư còn lại: ${userWallets[cleanUser].balance}đ`);

    res.json({ 
        success: true, 
        message: "Mua đề thi thành công!", 
        newBalance: userWallets[cleanUser].balance 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});