
const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);
const { getTermBank, getSubjectBank } = require('../services/questionBankService');

module.exports = function createAdminRoutes({ pool, requireAuth, catalog, questionBank }) {
  const router = express.Router();
  const envAdmins = () => (process.env.ADMIN_USERNAMES || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const isSuperAdmin = username => envAdmins().includes(String(username || '').toLowerCase());

  const requireAdmin = async (req, res, next) => {
    try {
      if (isSuperAdmin(req.user.username)) { req.adminRole = 'super_admin'; return next(); }
      const result = await pool.query('SELECT role FROM admin_roles WHERE LOWER(username)=LOWER($1)', [req.user.username]);
      if (!result.rowCount) return res.status(403).json({ message: 'Bạn không có quyền quản trị!' });
      req.adminRole = result.rows[0].role;
      next();
    } catch (e) {
      console.error('Admin authorization:', e.message);
      res.status(500).json({ message: 'Không thể xác minh quyền quản trị.' });
    }
  };
  const requireSuper = (req,res,next) => req.adminRole === 'super_admin'
    ? next() : res.status(403).json({ message: 'Chỉ Super Admin mới được thực hiện thao tác này.' });
  const requireManager = (req,res,next) => ['super_admin','admin'].includes(req.adminRole)
    ? next() : res.status(403).json({ message: 'Vai trò hỗ trợ chỉ có quyền xem dữ liệu.' });
  const audit = async (client, actor, action, target, details={}) => {
    await client.query('INSERT INTO admin_audit_log(actor,action,target,details) VALUES($1,$2,$3,$4::jsonb)',
      [actor, action, String(target || ''), JSON.stringify(details)]);
  };

  router.use('/api/admin', requireAuth, requireAdmin);

  // DOCX upload is parsed by the bundled Python script, including Word OMML equations.
  const docxRaw = express.raw({
    type: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/octet-stream'
    ],
    limit: '20mb'
  });
  const runDocxParser = async (buffer, term) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hct-question-bank-'));
    const inputPath = path.join(tempDir, 'upload.docx');
    const outputPath = path.join(tempDir, 'parsed.json');
    try {
      await fs.writeFile(inputPath, buffer);
      const parserPath = path.join(__dirname, '..', 'scripts', 'parse_docx_bank.py');
      const commands = process.env.PYTHON
        ? [process.env.PYTHON]
        : (process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']);
      let lastError;
      for (const command of commands) {
        try {
          await runFile(command, [parserPath, inputPath, term, outputPath], { timeout: 90000, maxBuffer: 2 * 1024 * 1024 });
          const parsed = JSON.parse(await fs.readFile(outputPath, 'utf8'));
          return parsed.questions;
        } catch (error) {
          lastError = error;
          if (error.code !== 'ENOENT') break;
        }
      }
      throw new Error(lastError?.stderr?.trim() || lastError?.message || 'Không chạy được bộ đọc DOCX. Hãy cài Python và python-docx trên máy chủ.');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  };
  const questionFingerprint = question => JSON.stringify({
    content: question.content ?? question.text ?? question.question ?? '',
    options: question.options || {},
    correct: question.correct || ''
  });

  router.post('/api/admin/question-banks/:subjectId/preview', requireManager, docxRaw, async (req, res) => {
    const subjectId = String(req.params.subjectId || '');
    const term = String(req.query.term || 'midterm');
    const knownSubject = Object.values(catalog).some(university =>
      (university.subjects || []).some(subject => subject.id === subjectId)
    );
    if (!knownSubject) return res.status(404).json({ message: 'Không tìm thấy môn học.' });
    if (!['midterm', 'final'].includes(term)) return res.status(400).json({ message: 'Kỳ thi không hợp lệ.' });
    if (!Buffer.isBuffer(req.body) || req.body.length < 100 || req.body.length > 20 * 1024 * 1024) {
      return res.status(400).json({ message: 'Hãy chọn file Word .docx hợp lệ (tối đa 20 MB).' });
    }

    try {
      const questions = await runDocxParser(req.body, term);
      const seen = new Set();
      for (const question of questions) {
        question.id = String(question.id || '');
        question.term = term;
        question.text = question.content;
        question.question = question.content;
        question.title = question.content;
        if (!question.id || seen.has(question.id)) throw new Error(`Mã câu hỏi bị trùng hoặc trống: ${question.id || '(trống)'}`);
        seen.add(question.id);
        if (!Number.isInteger(Number(question.type)) || Number(question.type) < 1 || Number(question.type) > 100) {
          throw new Error(`Dạng câu hỏi không hợp lệ tại ${question.id}.`);
        }
        if (!question.content?.trim() || !['A','B','C','D'].every(key => question.options?.[key]?.trim()) || !'ABCD'.includes(question.correct)) {
          throw new Error(`Câu ${question.id} thiếu nội dung, phương án hoặc đáp án đúng.`);
        }
      }
      const oldQuestions = await getTermBank(pool, questionBank, subjectId, term);
      const oldById = new Map(oldQuestions.map(question => [String(question.id), question]));
      const newById = new Map(questions.map(question => [String(question.id), question]));
      let added = 0, changed = 0, unchanged = 0, removed = 0;
      const differences = { added: [], changed: [], removed: [] };
      for (const question of questions) {
        const old = oldById.get(String(question.id));
        if (!old) { added++; differences.added.push(String(question.id)); }
        else if (questionFingerprint(old) === questionFingerprint(question)) unchanged++;
        else { changed++; differences.changed.push(String(question.id)); }
      }
      for (const old of oldQuestions) {
        if (!newById.has(String(old.id))) { removed++; differences.removed.push(String(old.id)); }
      }

      const summary = {
        questionCount: questions.length,
        typeCounts: questions.reduce((counts, question) => {
          const key = String(question.type);
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        }, {}),
        added, changed, unchanged, removed
      };
      const previewId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO question_bank_import_previews(preview_id,username,subject_id,exam_term,questions,summary,expires_at)
         VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW()+INTERVAL '30 minutes')`,
        [previewId, req.user.username, subjectId, term, JSON.stringify(questions), JSON.stringify(summary)]
      );
      await pool.query('DELETE FROM question_bank_import_previews WHERE expires_at < NOW()');
      return res.json({ success: true, previewId, summary, differences, expiresInMinutes: 30 });
    } catch (error) {
      console.error('DOCX preview error:', error.message);
      return res.status(400).json({ message: error.message || 'Không đọc được file Word. Ngân hàng hiện tại chưa bị thay đổi.' });
    }
  });

  router.post('/api/admin/question-banks/previews/:previewId/publish', requireManager, async (req, res) => {
    const previewId = String(req.params.previewId || '');
    if (!/^[0-9a-f-]{36}$/i.test(previewId)) return res.status(400).json({ message: 'Mã bản xem trước không hợp lệ.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const previewResult = await client.query(
        `SELECT preview_id,subject_id,exam_term,questions,summary
         FROM question_bank_import_previews
         WHERE preview_id=$1 AND username=$2 AND expires_at>NOW()
         FOR UPDATE`,
        [previewId, req.user.username]
      );
      if (!previewResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Bản xem trước đã hết hạn hoặc không tồn tại. Hãy tải file và kiểm tra lại.' });
      }
      const preview = previewResult.rows[0];
      const oldQuestions = await getTermBank(client, questionBank, preview.subject_id, preview.exam_term);
      const newQuestions = preview.questions || [];
      const newById = new Map(newQuestions.map(question => [String(question.id), question]));
      const changedIds = oldQuestions
        .filter(old => !newById.has(String(old.id)) || questionFingerprint(old) !== questionFingerprint(newById.get(String(old.id))))
        .map(old => String(old.id));

      if (changedIds.length) {
        await client.query(
          `DELETE FROM exam_question_history
           WHERE subject_id=$1 AND exam_term=$2 AND question_id=ANY($3::text[])`,
          [preview.subject_id, preview.exam_term, changedIds]
        );
      }
      await client.query(
        `INSERT INTO question_banks(subject_id,exam_term,questions,version,updated_by,updated_at)
         VALUES($1,$2,$3::jsonb,1,$4,NOW())
         ON CONFLICT(subject_id,exam_term) DO UPDATE SET
           questions=EXCLUDED.questions, version=question_banks.version+1,
           updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
        [preview.subject_id, preview.exam_term, JSON.stringify(newQuestions), req.user.username]
      );
      await audit(client, req.user.username, 'publish_question_bank', preview.subject_id, {
        term: preview.exam_term, ...preview.summary, clearedHistoryForChangedOrRemoved: changedIds.length
      });
      await client.query('DELETE FROM question_bank_import_previews WHERE preview_id=$1', [previewId]);
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: `Đã cập nhật ${newQuestions.length} câu hỏi. Cấu hình số câu và thời gian thi được giữ nguyên.`,
        summary: preview.summary
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Publish question bank error:', error.message);
      return res.status(500).json({ message: 'Không cập nhật được ngân hàng câu hỏi. Dữ liệu cũ vẫn được giữ nguyên.' });
    } finally {
      client.release();
    }
  });

  router.get('/api/admin/dashboard', async (req,res) => {
    try {
      const [users, money, sales, latest] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '30 days')::int new_30d,
          COUNT(*) FILTER(WHERE status='suspended')::int suspended FROM users`),
        pool.query(`SELECT COALESCE(SUM(balance),0)::numeric(16,2) total_balance FROM users`),
        pool.query(`SELECT COUNT(*)::int purchases, COALESCE(SUM(amount),0)::numeric(16,2) revenue
          FROM wallet_transactions WHERE type='exam_purchase' AND created_at >= NOW()-INTERVAL '30 days'`),
        pool.query(`SELECT DATE(created_at) AS sale_date, COUNT(*)::int purchases, COALESCE(SUM(amount),0)::numeric(16,2) revenue
          FROM wallet_transactions WHERE type='exam_purchase' AND created_at >= NOW()-INTERVAL '14 days'
          GROUP BY DATE(created_at) ORDER BY DATE(created_at)`)
      ]);
      res.json({ users: users.rows[0], money: money.rows[0], sales: sales.rows[0], daily: latest.rows });
    } catch(e) { console.error('Admin dashboard:',e.message); res.status(500).json({message:'Không tải được thống kê.'}); }
  });

  router.get('/api/admin/users', async (req,res) => {
    const q = String(req.query.q || '').trim().slice(0,100);
    const status = ['active','suspended'].includes(req.query.status) ? req.query.status : null;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit)||50));
    try {
      const result = await pool.query(`SELECT username,email,balance,status,created_at FROM users
        WHERE ($1='' OR username ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR status=$2) ORDER BY created_at DESC LIMIT $3`,[q,status,limit]);
      res.json({users:result.rows});
    } catch(e) { console.error('Admin users:',e.message); res.status(500).json({message:'Không tải được danh sách tài khoản.'}); }
  });

  router.patch('/api/admin/users/:username/status', requireManager, async (req,res) => {
    const username = String(req.params.username || '').trim();
    const status = req.body?.status;
    if (!['active','suspended'].includes(status)) return res.status(400).json({message:'Trạng thái không hợp lệ.'});
    if (username.toLowerCase() === req.user.username.toLowerCase()) return res.status(400).json({message:'Không thể tự khóa tài khoản đang sử dụng.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query('UPDATE users SET status=$1 WHERE LOWER(username)=LOWER($2) RETURNING username,status',[status,username]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({message:'Không tìm thấy tài khoản.'}); }
      if (status==='suspended') await client.query('DELETE FROM user_sessions WHERE LOWER(username)=LOWER($1)',[username]);
      await audit(client,req.user.username,status==='suspended'?'suspend_user':'activate_user',username,{status});
      await client.query('COMMIT');
      res.json({success:true,user:found.rows[0]});
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e.message); res.status(500).json({message:'Không cập nhật được tài khoản.'}); }
    finally { client.release(); }
  });

  router.post('/api/admin/users/:username/wallet', requireManager, async (req,res) => {
    const username=String(req.params.username||'').trim();
    const amount=Number(req.body?.amount);
    const direction=req.body?.direction;
    const description=String(req.body?.description||'Điều chỉnh bởi quản trị viên').trim().slice(0,250);
    if (!Number.isSafeInteger(amount)||amount<=0||amount>1000000000||!['credit','debit'].includes(direction))
      return res.status(400).json({message:'Số tiền phải là số nguyên dương tối đa 1 tỷ đồng và chọn cộng/trừ.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const delta=direction==='credit'?amount:-amount;
      const updated=await client.query(`UPDATE users SET balance=balance+$1 WHERE LOWER(username)=LOWER($2) AND balance+$1>=0 RETURNING username,balance`,[delta,username]);
      if (!updated.rowCount) {
        const exists=await client.query('SELECT 1 FROM users WHERE LOWER(username)=LOWER($1)',[username]);
        await client.query('ROLLBACK');
        return res.status(exists.rowCount?400:404).json({message:exists.rowCount?'Số dư không đủ để trừ.':'Không tìm thấy tài khoản.'});
      }
      await client.query(`INSERT INTO wallet_transactions(username,type,amount,description) VALUES($1,$2,$3,$4)`,
        [updated.rows[0].username,direction==='credit'?'admin_credit':'admin_debit',amount,description]);
      await audit(client,req.user.username,direction==='credit'?'wallet_credit':'wallet_debit',updated.rows[0].username,{amount,description});
      await client.query('COMMIT');
      res.json({success:true,user:updated.rows[0]});
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); console.error(e.message); res.status(500).json({message:'Không điều chỉnh được số dư.'}); }
    finally { client.release(); }
  });

  router.get('/api/admin/deposits', async (req,res) => {
    const status = ['pending','paid','expired','manual_review'].includes(req.query.status) ? req.query.status : null;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    try {
      const result = await pool.query(
        `SELECT d.id,d.username,d.credit_amount,d.transfer_amount,d.order_code,d.status,
                d.expires_at,d.paid_at,d.sepay_transaction_id,d.created_at,
                s.content AS bank_content,s.reference_code AS bank_reference,s.created_at AS bank_received_at
         FROM deposit_orders d
         LEFT JOIN sepay_transactions s ON s.matched_order_id=d.id
         WHERE ($1::text IS NULL OR d.status=$1)
         ORDER BY d.created_at DESC LIMIT $2`,
        [status, limit]
      );
      res.json({ deposits: result.rows });
    } catch (e) {
      console.error('Admin deposits:', e.message);
      res.status(500).json({ message: 'Không tải được danh sách đơn nạp.' });
    }
  });

  router.get('/api/admin/transactions', async (req,res) => {
    const username=String(req.query.username||'').trim().slice(0,80);
    try {
      const result=await pool.query(`SELECT id,username,type,amount,description,created_at FROM wallet_transactions
        WHERE ($1='' OR username ILIKE '%'||$1||'%') ORDER BY created_at DESC LIMIT 200`,[username]);
      res.json({transactions:result.rows});
    } catch(e) { console.error(e.message); res.status(500).json({message:'Không tải được giao dịch.'}); }
  });

  router.get('/api/admin/pricing', async (req,res) => {
    try {
      const result=await pool.query("SELECT value,updated_at,updated_by FROM app_settings WHERE key='exam_price'");
      res.json({examPrice:Number(result.rows[0]?.value??1000),updatedAt:result.rows[0]?.updated_at||null,updatedBy:result.rows[0]?.updated_by||null});
    } catch(e) { res.status(500).json({message:'Không tải được giá.'}); }
  });
  router.put('/api/admin/pricing', requireManager, async (req,res) => {
    const amount=Number(req.body?.examPrice);
    if(!Number.isSafeInteger(amount)||amount<0||amount>100000000) return res.status(400).json({message:'Giá phải từ 0 đến 100.000.000 VNĐ.'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const old=await client.query("SELECT value FROM app_settings WHERE key='exam_price' FOR UPDATE");
      const previous=Number(old.rows[0]?.value??0);
      await client.query(`INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES('exam_price',to_jsonb($1::numeric),$2,NOW())
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[amount,req.user.username]);
      await client.query(`INSERT INTO pricing_audit_log(setting_key,old_value,new_value,changed_by) VALUES('exam_price',to_jsonb($1::numeric),to_jsonb($2::numeric),$3)`,[previous,amount,req.user.username]);
      await audit(client,req.user.username,'change_exam_price','exam_price',{old:previous,new:amount});
      await client.query('COMMIT');
      res.json({success:true,examPrice:amount});
    } catch(e) { await client.query('ROLLBACK').catch(()=>{}); res.status(500).json({message:'Không lưu được giá.'}); }
    finally {client.release();}
  });

  router.get('/api/admin/catalog', async (req,res) => {
    try {
      const enabled=await pool.query('SELECT subject_id,enabled FROM subject_settings');
      const map=new Map(enabled.rows.map(x=>[x.subject_id,x.enabled]));
      const subjects=[];
      for (const [uniId, uni] of Object.entries(catalog)) {
        for (const subject of (uni.subjects || [])) {
          const bank = await getSubjectBank(pool, questionBank, subject.id);
          subjects.push({ universityId: uniId, universityName: uni.name, id: subject.id, name: subject.name, questionCount: bank.length, enabled: map.has(subject.id) ? map.get(subject.id) : true });
        }
      }
      res.json({subjects});
    } catch(e) { console.error('Admin catalog:', e.message); res.status(500).json({message:'Không tải được danh mục đề thi.'}); }
  });
  router.patch('/api/admin/catalog/:subjectId', requireManager, async (req,res) => {
    const id=String(req.params.subjectId||'');
    const enabled=req.body?.enabled;
    const exists=Object.values(catalog).some(u=>(u.subjects||[]).some(s=>s.id===id));
    if(!exists||typeof enabled!=='boolean') return res.status(400).json({message:'Môn học hoặc trạng thái không hợp lệ.'});
    try {
      await pool.query(`INSERT INTO subject_settings(subject_id,enabled,updated_by,updated_at) VALUES($1,$2,$3,NOW())
        ON CONFLICT(subject_id) DO UPDATE SET enabled=EXCLUDED.enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[id,enabled,req.user.username]);
      await pool.query('INSERT INTO admin_audit_log(actor,action,target,details) VALUES($1,$2,$3,$4::jsonb)',[req.user.username,'toggle_subject',id,JSON.stringify({enabled})]);
      res.json({success:true});
    } catch(e) {res.status(500).json({message:'Không cập nhật được môn học.'});}
  });

  router.get('/api/admin/audit', async (req,res) => {
    try {
      const result=await pool.query('SELECT id,actor,action,target,details,created_at FROM admin_audit_log ORDER BY created_at DESC LIMIT 200');
      res.json({logs:result.rows});
    } catch(e) {res.status(500).json({message:'Không tải được nhật ký quản trị.'});}
  });

  router.get('/api/admin/roles', requireSuper, async (req,res) => {
    try { const result=await pool.query('SELECT username,role,granted_by,created_at FROM admin_roles ORDER BY created_at DESC'); res.json({roles:result.rows,superAdmins:envAdmins()}); }
    catch(e) {res.status(500).json({message:'Không tải được phân quyền.'});}
  });
  router.post('/api/admin/roles', requireSuper, async (req,res) => {
    const username=String(req.body?.username||'').trim();
    const role=req.body?.role;
    if(!username||!['admin','support'].includes(role)) return res.status(400).json({message:'Tên tài khoản hoặc vai trò không hợp lệ.'});
    if(envAdmins().includes(username.toLowerCase())) return res.status(400).json({message:'Tài khoản Super Admin đã có quyền cao nhất.'});
    try {
      const user=await pool.query('SELECT username FROM users WHERE LOWER(username)=LOWER($1)',[username]);
      if(!user.rowCount) return res.status(404).json({message:'Không tìm thấy tài khoản.'});
      await pool.query(`INSERT INTO admin_roles(username,role,granted_by) VALUES($1,$2,$3)
        ON CONFLICT(username) DO UPDATE SET role=EXCLUDED.role,granted_by=EXCLUDED.granted_by,created_at=NOW()`,[user.rows[0].username,role,req.user.username]);
      await pool.query('INSERT INTO admin_audit_log(actor,action,target,details) VALUES($1,$2,$3,$4::jsonb)',[req.user.username,'grant_admin_role',username,JSON.stringify({role})]);
      res.json({success:true});
    } catch(e) {res.status(500).json({message:'Không cấp được quyền.'});}
  });
  router.delete('/api/admin/roles/:username', requireSuper, async (req,res) => {
    const username=String(req.params.username||'').trim();
    try {
      await pool.query('DELETE FROM admin_roles WHERE LOWER(username)=LOWER($1)',[username]);
      await pool.query('INSERT INTO admin_audit_log(actor,action,target,details) VALUES($1,$2,$3,$4::jsonb)',[req.user.username,'revoke_admin_role',username,'{}']);
      res.json({success:true});
    } catch(e) {res.status(500).json({message:'Không thu hồi được quyền.'});}
  });

  return router;
};
