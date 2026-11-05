const express = require('express');

module.exports = function createExamRoutes({ pool, questionBank, pricing, catalog, shuffleArray, requireAuth }) {
  const router = express.Router();
  const isAdminUser = (username) => (process.env.ADMIN_USERNAMES || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean).includes(String(username || '').toLowerCase());
  const requireAdmin = async (req, res, next) => {
    if (isAdminUser(req.user?.username)) return next();
    try {
      const role = await pool.query('SELECT role FROM admin_roles WHERE LOWER(username)=LOWER($1)', [req.user?.username || '']);
      if (role.rowCount) return next();
      return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
    } catch (error) {
      console.error('Xác minh quyền quản trị cấu hình đề:', error.message);
      return res.status(500).json({ message: 'Không thể xác minh quyền quản trị.' });
    }
  };

  const defaultDistribution = (subjectId) => subjectId === 'toancc1_iuh'
    ? { 1: 2, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 2, 13: 2, 14: 1, 15: 1, 16: 1 }
    : {};
  const countByType = (bank) => bank.reduce((acc, q) => {
    const type = Number(q.type);
    if (Number.isInteger(type) && type > 0) acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  // Per-subject exam configuration, stored in Neon.
  router.get('/api/admin/exam-settings', requireAuth, requireAdmin, async (req, res) => {
    try {
      const saved = await pool.query('SELECT subject_id, question_count, duration_minutes, question_distribution FROM exam_subject_settings');
      const settings = new Map(saved.rows.map(row => [row.subject_id, row]));
      const subjects = [];
      for (const [universityId, university] of Object.entries(catalog)) {
        for (const subject of (university.subjects || [])) {
          const bank = questionBank[subject.id] || [];
          const bankSize = bank.length;
          const row = settings.get(subject.id);
          const distribution = row?.question_distribution && Object.keys(row.question_distribution).length ? row.question_distribution : defaultDistribution(subject.id);
          subjects.push({
            id: subject.id, name: subject.name, universityId, universityName: university.name,
            bankSize,
            questionCount: Math.min(Number(row?.question_count || Math.min(20, bankSize)), bankSize),
            durationMinutes: Number(row?.duration_minutes || (subject.id === 'toancc1_iuh' ? 60 : 15)),
            questionDistribution: distribution, typeCounts: countByType(bank)
          });
        }
      }
      return res.json({ subjects });
    } catch (error) {
      console.error('Admin đọc cấu hình đề:', error.message);
      return res.status(500).json({ message: 'Không tải được cấu hình đề thi.' });
    }
  });

  router.put('/api/admin/exam-settings/:subjectId', requireAuth, requireAdmin, async (req, res) => {
    const subjectId = String(req.params.subjectId || '');
    const questionCount = Number(req.body?.questionCount);
    const durationMinutes = Number(req.body?.durationMinutes);
    const questionDistribution = req.body?.questionDistribution && typeof req.body.questionDistribution === 'object' ? req.body.questionDistribution : null;
    const bankSize = (questionBank[subjectId] || []).length;
    if (!bankSize) return res.status(404).json({ message: 'Không tìm thấy môn học hoặc kho câu hỏi trống.' });
    if (!Number.isSafeInteger(questionCount) || questionCount < 1 || questionCount > bankSize) {
      return res.status(400).json({ message: `Số câu phải từ 1 đến ${bankSize}.` });
    }
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
      return res.status(400).json({ message: 'Thời gian phải từ 1 đến 360 phút.' });
    }
    const distribution = questionDistribution || defaultDistribution(subjectId);
    if (Object.keys(distribution).length) {
      const available = countByType(questionBank[subjectId] || []);
      const normalized = {};
      for (const [rawType, rawCount] of Object.entries(distribution)) {
        const type = Number(rawType), count = Number(rawCount);
        if (!Number.isInteger(type) || type < 1 || type > 100 || !Number.isSafeInteger(count) || count < 0 || count > (available[type] || 0)) {
          return res.status(400).json({ message: `Cấu hình Dạng ${rawType} không hợp lệ hoặc vượt số câu trong ngân hàng.` });
        }
        if (count > 0) normalized[type] = count;
      }
      if (Object.values(normalized).reduce((a,b)=>a+b,0) !== questionCount) {
        return res.status(400).json({ message: 'Tổng số câu theo các dạng phải bằng tổng số câu của đề.' });
      }
    }
    try {
      await pool.query(
        `INSERT INTO exam_subject_settings(subject_id,question_count,duration_minutes,question_distribution,updated_by,updated_at)
         VALUES($1,$2,$3,$4::jsonb,$5,NOW())
         ON CONFLICT(subject_id) DO UPDATE SET question_count=EXCLUDED.question_count,
           duration_minutes=EXCLUDED.duration_minutes,question_distribution=EXCLUDED.question_distribution,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [subjectId, questionCount, durationMinutes, JSON.stringify(distribution), req.user.username]
      );
      return res.json({ success: true, subjectId, questionCount, durationMinutes, questionDistribution: distribution });
    } catch (error) {
      console.error('Admin lưu cấu hình đề:', error.message);
      return res.status(500).json({ message: 'Không lưu được cấu hình đề thi.' });
    }
  });

  router.get('/api/admin/pricing', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await pool.query("SELECT value, updated_at FROM app_settings WHERE key = 'exam_price'");
      return res.json({ examPrice: Number(result.rows[0]?.value ?? pricing.EXAM_PRICE), updatedAt: result.rows[0]?.updated_at || null });
    } catch (error) {
      console.error('Admin đọc giá:', error.message);
      return res.status(500).json({ message: 'Không tải được giá hiện tại!' });
    }
  });

  router.put('/api/admin/pricing', requireAuth, requireAdmin, async (req, res) => {
    const amount = Number(req.body?.examPrice);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      return res.status(400).json({ message: 'Giá phải là số nguyên từ 0 đến 100.000.000 VNĐ!' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query("SELECT value FROM app_settings WHERE key = 'exam_price' FOR UPDATE");
      const oldValue = Number(current.rows[0]?.value ?? pricing.EXAM_PRICE);
      await client.query("INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('exam_price', to_jsonb($1::numeric), $2, NOW()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()", [amount, req.user.username]);
      await client.query("INSERT INTO pricing_audit_log (setting_key, old_value, new_value, changed_by) VALUES ('exam_price', to_jsonb($1::numeric), to_jsonb($2::numeric), $3)", [oldValue, amount, req.user.username]);
      await client.query('COMMIT');
      return res.json({ success: true, examPrice: amount, message: `Đã cập nhật giá đề thi thành ${amount.toLocaleString('vi-VN')} VNĐ.` });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Admin cập nhật giá:', error.message);
      return res.status(500).json({ message: 'Không thể cập nhật giá lúc này!' });
    } finally { client.release(); }
  });
  router.get('/api/universities', (req, res) => {
    res.json(Object.keys(catalog).map(key => ({ id: key, name: catalog[key].name })));
  });
  router.get('/api/universities/:uniId/subjects', async (req, res) => {
    const { uniId } = req.params;
    if (!catalog[uniId]) return res.status(404).json({ message: 'Không tìm thấy trường!' });
    try {
      const settings = await pool.query('SELECT subject_id, enabled FROM subject_settings');
      const flags = new Map(settings.rows.map(row => [row.subject_id, row.enabled]));
      return res.json(catalog[uniId].subjects.filter(subject => flags.get(subject.id) !== false));
    } catch (error) {
      console.error('Không tải được trạng thái môn học:', error.message);
      return res.status(500).json({ message: 'Không tải được danh sách môn học!' });
    }
  });
  const crypto = require('node:crypto');
  router.get('/api/exam/random/:subjectId', requireAuth, async (req, res) => {
    const bank = questionBank[req.params.subjectId];
    if (!bank || bank.length === 0) return res.status(404).json({ message: 'Kho câu hỏi trống!' });
    let examConfig = { questionCount: Math.min(20, bank.length), durationMinutes: req.params.subjectId === 'toancc1_iuh' ? 60 : 15, questionDistribution: defaultDistribution(req.params.subjectId) };
    try {
      const savedConfig = await pool.query(
        'SELECT question_count, duration_minutes, question_distribution FROM exam_subject_settings WHERE subject_id = $1',
        [req.params.subjectId]
      );
      if (savedConfig.rows[0]) {
        examConfig = {
          questionCount: Math.min(Number(savedConfig.rows[0].question_count), bank.length),
          durationMinutes: Number(savedConfig.rows[0].duration_minutes),
          questionDistribution: savedConfig.rows[0].question_distribution && Object.keys(savedConfig.rows[0].question_distribution).length ? savedConfig.rows[0].question_distribution : defaultDistribution(req.params.subjectId)
        };
      }
    } catch (error) {
      console.error('Không đọc được cấu hình đề môn học:', error.message);
      return res.status(500).json({ message: 'Không tải được cấu hình đề thi.' });
    }
    let selectedQuestions = [];
    try {
      const seenResult = await pool.query(`SELECT question_id FROM exam_question_history WHERE username=$1 AND subject_id=$2
        UNION SELECT jsonb_array_elements_text(question_ids) AS question_id FROM exam_attempts
        WHERE username=$1 AND subject_id=$2 AND submitted_at IS NULL AND expires_at > NOW()`, [req.user.username, req.params.subjectId]);
      const seen = new Set(seenResult.rows.map(row => String(row.question_id)));
      const distribution = examConfig.questionDistribution || {};
      if (Object.keys(distribution).length) {
        for (const [typeText, rawCount] of Object.entries(distribution)) {
          const type = Number(typeText), count = Number(rawCount);
          const group = bank.filter(q => Number(q.type) === type);
          const fresh = shuffleArray(group.filter(q => !seen.has(String(q.id))));
          const repeated = shuffleArray(group.filter(q => seen.has(String(q.id))));
          selectedQuestions.push(...fresh.slice(0, count));
          if (fresh.length < count) selectedQuestions.push(...repeated.slice(0, count - fresh.length));
        }
      } else {
        const fresh = shuffleArray(bank.filter(q => !seen.has(String(q.id))));
        selectedQuestions = fresh.slice(0, examConfig.questionCount);
        if (selectedQuestions.length < examConfig.questionCount) {
          const chosen = new Set(selectedQuestions.map(q => String(q.id)));
          selectedQuestions.push(...shuffleArray(bank.filter(q => !chosen.has(String(q.id)))).slice(0, examConfig.questionCount - selectedQuestions.length));
        }
      }
      selectedQuestions = shuffleArray(selectedQuestions);
      if (selectedQuestions.length !== examConfig.questionCount) return res.status(400).json({ message: 'Ngân hàng câu hỏi chưa đủ số lượng theo cấu hình từng dạng.' });
    } catch (error) {
      console.error('Không đọc được lịch sử câu hỏi:', error.message);
      return res.status(500).json({ message: 'Không thể tạo đề thi lúc này!' });
    }
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
        `INSERT INTO exam_attempts (id, username, subject_id, question_ids, answer_key, explanations, total_questions, expires_at)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, NOW() + INTERVAL '2 hours')`,
        [attemptId, req.user.username, req.params.subjectId, JSON.stringify(selectedQuestions.map(q => String(q.id))), JSON.stringify(answerKey), JSON.stringify(explanationKey), clientQuestions.length]
      );
      return res.json({ attemptId, title: 'Đề thi ngẫu nhiên', durationMinutes: examConfig.durationMinutes, questions: clientQuestions });
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
        `SELECT answer_key, explanations, total_questions, subject_id, question_ids FROM exam_attempts
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
      const attempt = found.rows[0];
      for (const questionId of (attempt.question_ids || [])) {
        await client.query(`INSERT INTO exam_question_history(username,subject_id,question_id)
          VALUES($1,$2,$3) ON CONFLICT(username,subject_id,question_id)
          DO UPDATE SET last_seen_at=NOW(),seen_count=exam_question_history.seen_count+1`,
          [req.user.username, attempt.subject_id, String(questionId)]);
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
    if (!subjectId || !questionBank[subjectId]) {
      return res.status(400).json({ success: false, message: 'Thông tin giao dịch không hợp lệ!' });
    }
    const client = await pool.connect();
    try {
      const subjectSetting = await client.query('SELECT enabled FROM subject_settings WHERE subject_id=$1', [subjectId]);
      if (subjectSetting.rows[0]?.enabled === false) return res.status(403).json({ success: false, message: 'Môn học hiện đang tạm ngừng bán.' });
      await client.query('BEGIN');
      const priceResult = await client.query("SELECT value FROM app_settings WHERE key = 'exam_price' FOR SHARE");
      const amount = Number(priceResult.rows[0]?.value ?? pricing.EXAM_PRICE);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Giá đề thi trong cấu hình không hợp lệ');
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
    if (!isAdminUser(req.user.username)) return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
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
