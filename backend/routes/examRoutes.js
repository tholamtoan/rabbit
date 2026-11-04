const express = require('express');

module.exports = function createExamRoutes({ pool, questionBank, pricing, catalog, shuffleArray, requireAuth }) {
  const router = express.Router();
  router.get('/api/universities', (req, res) => {
    res.json(Object.keys(catalog).map(key => ({ id: key, name: catalog[key].name })));
  });
  router.get('/api/universities/:uniId/subjects', (req, res) => {
    const { uniId } = req.params;
    if (catalog[uniId]) res.json(catalog[uniId].subjects);
    else res.status(404).json({ message: 'Không tìm thấy trường!' });
  });
  const crypto = require('node:crypto');
  router.get('/api/exam/random/:subjectId', requireAuth, async (req, res) => {
    const bank = questionBank[req.params.subjectId];
    if (!bank || bank.length === 0) return res.status(404).json({ message: 'Kho câu hỏi trống!' });
    const selectedQuestions = shuffleArray(bank).slice(0, 20);
    const answerKey = {};
    const explanationKey = {};
    const clientQuestions = selectedQuestions.map((q, index) => {
      const qId = String(q.id || index + 1);
      const shuffledOptions = shuffleArray(Object.entries(q.options || {}));
      const displayedOptions = {};
      let displayedCorrect = null;
      shuffledOptions.forEach(([oldLabel, optionContent], optionIndex) => {
        const newLabel = String.fromCharCode(65 + optionIndex);
        displayedOptions[newLabel] = optionContent;
        if (oldLabel === q.correct) displayedCorrect = newLabel;
      });
      answerKey[qId] = displayedCorrect;
      explanationKey[qId] = q.explanation || '';
      return { id: qId, content: q.content ?? q.text ?? q.question ?? '', options: displayedOptions };
    });
    const attemptId = crypto.randomUUID();
    try {
      await pool.query(
        `INSERT INTO exam_attempts (id, username, answer_key, explanations, total_questions, expires_at)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW() + INTERVAL '2 hours')`,
        [attemptId, req.user.username, JSON.stringify(answerKey), JSON.stringify(explanationKey), clientQuestions.length]
      );
      return res.json({ attemptId, title: 'Đề thi ngẫu nhiên', durationMinutes: 15, questions: clientQuestions });
    } catch (error) {
      console.error('Không lưu được đề thi:', error.message);
      return res.status(500).json({ message: 'Không thể tạo đề thi lúc này!' });
    }
  });

  router.post('/api/exam/submit-random', requireAuth, async (req, res) => {
    const { attemptId, userAnswers } = req.body;
    if (typeof attemptId !== 'string' || !/^[0-9a-f-]{36}$/i.test(attemptId) || !userAnswers || typeof userAnswers !== 'object' || Array.isArray(userAnswers)) {
      return res.status(400).json({ message: 'Dữ liệu bài làm không hợp lệ!' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT answer_key, explanations, total_questions FROM exam_attempts
         WHERE id = $1 AND username = $2 AND expires_at > NOW() AND submitted_at IS NULL FOR UPDATE`,
        [attemptId, req.user.username]
      );
      if (!found.rowCount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Đề thi không hợp lệ, đã nộp hoặc đã hết hạn. Hãy tạo đề mới!' });
      }
      const { answer_key: answerKey, explanations, total_questions: total } = found.rows[0];
      const details = [];
      let score = 0;
      for (const [qId, correctAnswer] of Object.entries(answerKey)) {
        const submitted = typeof userAnswers[qId] === 'string' ? userAnswers[qId] : '';
        const isCorrect = submitted === correctAnswer;
        if (isCorrect) score += 1;
        details.push({ questionId: qId, userAnswer: submitted || 'Chưa chọn', correctAnswer, isCorrect, explanation: explanations?.[qId] || '' });
      }
      await client.query('UPDATE exam_attempts SET submitted_at = NOW() WHERE id = $1', [attemptId]);
      await client.query('COMMIT');
      return res.json({ totalQuestions: Number(total), score, percentage: total ? Math.round((score / total) * 100) : 0, details });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Lỗi chấm bài:', error.message);
      return res.status(500).json({ message: 'Không thể chấm bài lúc này!' });
    } finally { client.release(); }
  });

  // User identity is taken only from the validated session, never from URL/body.
  const getWallet = async (req, res) => {
    try {
      const result = await pool.query('SELECT username, balance FROM users WHERE username = $1', [req.user.username]);
      if (!result.rows[0]) return res.status(404).json({ message: 'Không tìm thấy tài khoản!' });
      return res.json({ userId: result.rows[0].username, balance: Number(result.rows[0].balance) });
    } catch (error) {
      console.error('Lỗi lấy số dư:', error.message);
      return res.status(500).json({ message: 'Không thể tải số dư lúc này!' });
    }
  };
  router.get('/api/wallet', requireAuth, getWallet);
  router.get('/api/wallet/:userId', requireAuth, getWallet);

  router.post('/api/exam/buy', requireAuth, async (req, res) => {
    const { subjectId } = req.body;
    const amount = Number(pricing.EXAM_PRICE);
    if (!subjectId || !questionBank[subjectId] || !Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Thông tin giao dịch không hợp lệ!' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT username, balance FROM users WHERE username = $1 FOR UPDATE', [req.user.username]);
      const user = result.rows[0];
      if (!user || Number(user.balance) < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Số dư không đủ!' });
      }
      const updated = await client.query('UPDATE users SET balance = balance - $1 WHERE username = $2 RETURNING balance', [amount, user.username]);
      await client.query(
        `INSERT INTO wallet_transactions (username, type, amount, description) VALUES ($1, 'exam_purchase', $2, $3)`,
        [user.username, amount, `Mua đề môn ${subjectId}`]
      );
      await client.query('COMMIT');
      return res.json({ success: true, message: 'Mua đề thi thành công!', newBalance: Number(updated.rows[0].balance) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Lỗi mua đề thi:', error.message);
      return res.status(500).json({ success: false, message: 'Không thể thực hiện giao dịch lúc này!' });
    } finally { client.release(); }
  });

  // Admin credit is disabled unless ADMIN_USERNAMES is explicitly configured on Render.
  router.post('/api/admin/wallet/credit', requireAuth, async (req, res) => {
    const admins = (process.env.ADMIN_USERNAMES || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
    if (!admins.includes(req.user.username.toLowerCase())) return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
    const username = String(req.body.username || '').trim().toLowerCase();
    const amount = Number(req.body.amount);
    const description = String(req.body.description || 'Admin cộng tiền test').slice(0, 200);
    if (!username || !Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) {
      return res.status(400).json({ message: 'Tài khoản hoặc số tiền không hợp lệ!' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query('UPDATE users SET balance = balance + $1 WHERE username = $2 RETURNING username, balance', [amount, username]);
      if (!updated.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Không tìm thấy tài khoản!' }); }
      await client.query("INSERT INTO wallet_transactions (username, type, amount, description) VALUES ($1, 'admin_credit', $2, $3)", [username, amount, description]);
      await client.query('COMMIT');
      return res.json({ success: true, username: updated.rows[0].username, balance: Number(updated.rows[0].balance) });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Admin credit:', error.message);
      return res.status(500).json({ message: 'Không thể cộng tiền lúc này!' });
    } finally { client.release(); }
  });
  return router;
};
