
const express = require('express');

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

  router.get('/api/admin/dashboard', async (req,res) => {
    try {
      const [users, money, sales, latest] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int total, COUNT(*) FILTER(WHERE created_at >= NOW()-INTERVAL '30 days')::int new_30d,
          COUNT(*) FILTER(WHERE status='suspended')::int suspended FROM users`),
        pool.query(`SELECT COALESCE(SUM(balance),0)::numeric(16,2) total_balance FROM users`),
        pool.query(`SELECT COUNT(*)::int purchases, COALESCE(SUM(amount),0)::numeric(16,2) revenue
          FROM wallet_transactions WHERE type='exam_purchase' AND created_at >= NOW()-INTERVAL '30 days'`),
        pool.query(`SELECT DATE(created_at) day, COUNT(*)::int purchases, COALESCE(SUM(amount),0)::numeric(16,2) revenue
          FROM wallet_transactions WHERE type='exam_purchase' AND created_at >= NOW()-INTERVAL '14 days'
          GROUP BY DATE(created_at) ORDER BY day`)
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

  // Add a university/subject without editing catalog.js. The entry is persisted and restored at startup.
  router.post('/api/admin/subjects', requireManager, async (req,res) => {
    const universityId = String(req.body?.universityId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0,60);
    const universityName = String(req.body?.universityName || '').trim().slice(0,180);
    const subjectId = String(req.body?.subjectId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0,80);
    const subjectName = String(req.body?.subjectName || '').trim().slice(0,180);
    if (!universityId || !universityName || !subjectId || !subjectName) return res.status(400).json({message:'Cần nhập mã/tên trường và mã/tên môn học.'});
    const existing = Object.values(catalog).some(u => (u.subjects || []).some(s => s.id === subjectId));
    if (existing) return res.status(409).json({message:'Mã môn học đã tồn tại. Hãy dùng mã khác.'});
    try {
      await pool.query(`INSERT INTO managed_subjects(subject_id,university_id,university_name,subject_name,created_by)
        VALUES($1,$2,$3,$4,$5)`,[subjectId,universityId,universityName,subjectName,req.user.username]);
      if (!catalog[universityId]) catalog[universityId] = {name:universityName,subjects:[]};
      else catalog[universityId].name = universityName;
      catalog[universityId].subjects.push({id:subjectId,name:subjectName});
      await pool.query('INSERT INTO admin_audit_log(actor,action,target,details) VALUES($1,$2,$3,$4::jsonb)',
        [req.user.username,'create_subject',subjectId,JSON.stringify({universityId,universityName,subjectName})]);
      res.json({success:true,subject:{id:subjectId,name:subjectName,universityId,universityName},message:`Đã tạo môn ${subjectName}. Giờ có thể upload ngân hàng câu hỏi.`});
    } catch(e) {
      console.error('Create subject:',e.message);
      res.status(500).json({message:'Không tạo được môn học. Kiểm tra mã môn có bị trùng không.'});
    }
  });

  // Replace/import a complete question bank for one subject. Uploads are stored in PostgreSQL,
  // so they survive Render restarts and do not depend on the ephemeral filesystem.
  router.post('/api/admin/question-bank/:subjectId', requireManager, async (req,res) => {
    const subjectId = String(req.params.subjectId || '');
    const exists = Object.values(catalog).some(u => (u.subjects || []).some(s => s.id === subjectId));
    const questions = req.body?.questions;
    if (!exists) return res.status(404).json({ message: 'Không tìm thấy môn học trong danh mục.' });
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20000) {
      return res.status(400).json({ message: 'File phải chứa mảng questions có từ 1 đến 20.000 câu.' });
    }
    const ids = new Set();
    const normalized = [];
    for (let i=0; i<questions.length; i++) {
      const q = questions[i] || {};
      const id = String(q.id ?? `${subjectId}-q${i+1}`).trim();
      const type = Number(q.type);
      const options = q.options;
      const correct = String(q.correct || '').toUpperCase();
      if (!id || ids.has(id) || !Number.isInteger(type) || type < 1 || type > 100 ||
          !String(q.content ?? q.text ?? '').trim() || !options || !['A','B','C','D'].every(k => typeof options[k] === 'string' && options[k].trim()) ||
          !['A','B','C','D'].includes(correct)) {
        return res.status(400).json({ message: `Câu thứ ${i+1} thiếu dữ liệu, trùng ID hoặc sai định dạng (cần dạng, nội dung, 4 lựa chọn và đáp án A-D).` });
      }
      ids.add(id);
      normalized.push({ id, type, content: String(q.content ?? q.text).trim(), options: {A:options.A,B:options.B,C:options.C,D:options.D}, correct, explanation: String(q.explanation || '') });
    }
    const byType = normalized.reduce((acc,q)=>{acc[q.type]=(acc[q.type]||0)+1;return acc;},{});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO question_banks(subject_id,questions,updated_by,updated_at)
        VALUES($1,$2::jsonb,$3,NOW()) ON CONFLICT(subject_id) DO UPDATE
        SET questions=EXCLUDED.questions,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [subjectId, JSON.stringify(normalized), req.user.username]);
      await audit(client, req.user.username, 'replace_question_bank', subjectId, { total: normalized.length, byType });
      await client.query('COMMIT');
      questionBank[subjectId] = normalized;
      res.json({ success:true, subjectId, total:normalized.length, byType, message:`Đã cập nhật ${normalized.length} câu hỏi.` });
    } catch(e) {
      await client.query('ROLLBACK').catch(()=>{});
      console.error('Upload question bank:',e.message);
      res.status(500).json({ message:'Không lưu được ngân hàng câu hỏi.' });
    } finally { client.release(); }
  });

  router.get('/api/admin/catalog', async (req,res) => {
    try {
      const enabled=await pool.query('SELECT subject_id,enabled FROM subject_settings');
      const map=new Map(enabled.rows.map(x=>[x.subject_id,x.enabled]));
      const subjects=[];
      for(const [uniId,uni] of Object.entries(catalog)) for(const subject of (uni.subjects||[]))
        subjects.push({universityId:uniId,universityName:uni.name,id:subject.id,name:subject.name,questionCount:(questionBank[subject.id]||[]).length,enabled:map.has(subject.id)?map.get(subject.id):true});
      res.json({subjects});
    } catch(e) {res.status(500).json({message:'Không tải được danh mục đề thi.'});}
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
