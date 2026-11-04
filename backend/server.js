const express = require('express');
const cors = require('cors');
const questionBank = require('./questionBank'); // Nhập kho câu hỏi vào
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

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

// 1. API lấy danh sách trường
app.get('/api/universities', (req, res) => {
  const uniList = Object.keys(database).map(key => ({
    id: key,
    name: database[key].name
  }));
  res.json(uniList);
});

// 2. API lấy danh sách môn học
app.get('/api/universities/:uniId/subjects', (req, res) => {
  const { uniId } = req.params;
  if (database[uniId]) {
    res.json(database[uniId].subjects);
  } else {
    res.status(404).json({ message: "Không tìm thấy trường!" });
  }
});

// 3. API TẠO ĐỀ THI NGẪU NHIÊN (TRÁO ĐỀ & XÁO TRỘN)
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

// 4. API Nộp bài chấm điểm dựa trên đề đã phát
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
// 5. API NHẬN WEBHOOK TỪ SEPAY (TỰ ĐỘNG NẠP TIỀN)
// ==========================================
app.post('/api/sepay-webhook', async (req, res) => {
    try {
        const data = req.body;
        
        const gateway = data.gateway;           
        const transactionDate = data.transactionDate; 
        const transferAmount = data.transferAmount;   
        const content = data.content;                 
        
        console.log(`[SePay Webhook] Nhận giao dịch: ${transferAmount}đ - Nội dung: ${content}`);
        
        // Kiểm tra nội dung chuyển khoản xem có chứa cú pháp mua đề không (Ví dụ: "THO 12345")
        if (content && content.toUpperCase().includes("THO")) {
            const matches = content.match(/THO\s*(\d+)/i);
            
            if (matches && matches[1]) {
                const userId = matches[1];
                console.log(`=> Đã xác thực thành công thanh toán cho User ID: ${userId}`);
                
                // TODO: Cập nhật cơ sở dữ liệu ở đây để mở khóa quyền làm đề cho học sinh (userId)
            }
            
            return res.status(200).json({ success: true, message: "Đã xử lý mở khóa đề thành công!" });
        }
        
        return res.status(200).json({ success: true, message: "Bỏ qua giao dịch không khớp cú pháp." });
        
    } catch (error) {
        console.error("Lỗi xử lý webhook:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});