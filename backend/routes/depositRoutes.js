const express = require('express');
const crypto = require('node:crypto');

module.exports = function createDepositRoutes({ pool, requireAuth }) {
  const router = express.Router();

  // Học viên tạo đơn nạp; số tiền chuyển là số tiền muốn nạp + mã phân biệt 1..99đ.
  router.post('/api/deposits/orders', requireAuth, async (req, res) => {
    const creditAmount = Number(req.body?.amount);
    if (!Number.isSafeInteger(creditAmount) || creditAmount < 10000 || creditAmount > 50000000 || creditAmount % 1000 !== 0) {
      return res.status(400).json({ message: 'Số tiền nạp phải từ 10.000đ đến 50.000.000đ và là bội số của 1.000đ.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize order allocation for each base amount to prevent two users receiving the same transfer amount.
      await client.query('SELECT pg_advisory_xact_lock($1)', [creditAmount]);
      const used = await client.query(
        `SELECT suffix FROM deposit_orders WHERE credit_amount=$1 AND status='pending' AND expires_at > NOW() FOR UPDATE`,
        [creditAmount]
      );
      const occupied = new Set(used.rows.map(r => Number(r.suffix)));
      let suffix = 0;
      for (let i = 1; i <= 99; i++) if (!occupied.has(i)) { suffix = i; break; }
      if (!suffix) {
        await client.query('ROLLBACK');
        return res.status(429).json({ message: 'Đang có quá nhiều đơn cùng mệnh giá. Vui lòng thử lại sau ít phút.' });
      }
      const transferAmount = creditAmount + suffix;
      const inserted = await client.query(
        `INSERT INTO deposit_orders(username,credit_amount,transfer_amount,suffix,status,expires_at)
         VALUES($1,$2,$3,$4,'pending',NOW()+INTERVAL '20 minutes')
         RETURNING id,credit_amount,transfer_amount,expires_at`,
        [req.user.username, creditAmount, transferAmount, suffix]
      );
      await client.query('COMMIT');
      return res.status(201).json({ order: inserted.rows[0], bank: 'BIDV', account: process.env.SEPAY_VA_ACCOUNT || '96247THOLAMTOAN' });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Tạo đơn nạp:', error.message);
      return res.status(500).json({ message: 'Không tạo được đơn nạp. Vui lòng thử lại.' });
    } finally { client.release(); }
  });

  router.get('/api/deposits/orders/current', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id,credit_amount,transfer_amount,status,expires_at,created_at FROM deposit_orders
         WHERE username=$1 ORDER BY created_at DESC LIMIT 10`, [req.user.username]
      );
      res.json({ orders: result.rows });
    } catch (error) {
      console.error('Lấy lịch sử đơn nạp:', error.message);
      res.status(500).json({ message: 'Không tải được lịch sử nạp tiền.' });
    }
  });

  // SePay webhook: configure API Key auth in dashboard and put the same key in SEPAY_WEBHOOK_API_KEY.
  router.post('/api/webhooks/sepay', async (req, res) => {
    const expected = process.env.SEPAY_WEBHOOK_API_KEY || '';
    const auth = String(req.headers.authorization || '');
    const supplied = auth.startsWith('Apikey ') ? auth.slice(7) : '';
    const suppliedBuf = Buffer.from(supplied);
    const expectedBuf = Buffer.from(expected);
    if (!expected || suppliedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(suppliedBuf, expectedBuf)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const p = req.body || {};
    const transactionId = String(p.id ?? '');
    const transferAmount = Number(p.transferAmount);
    const transferType = String(p.transferType || '').toLowerCase();
    if (!transactionId || transactionId === '0' || !Number.isSafeInteger(transferAmount) || transferAmount <= 0 || transferType !== 'in') {
      return res.status(200).json({ success: true, ignored: true });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const seen = await client.query('SELECT 1 FROM sepay_transactions WHERE transaction_id=$1', [transactionId]);
      if (seen.rowCount) { await client.query('COMMIT'); return res.status(200).json({ success: true, duplicate: true }); }
      const orderResult = await client.query(
        `SELECT * FROM deposit_orders WHERE transfer_amount=$1 AND status='pending' AND expires_at > NOW() FOR UPDATE`,
        [transferAmount]
      );
      await client.query(
        `INSERT INTO sepay_transactions(transaction_id,transfer_amount,content,reference_code,payload,matched_order_id)
         VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [transactionId, transferAmount, String(p.content || p.description || ''), String(p.referenceCode || ''), JSON.stringify(p), orderResult.rows[0]?.id || null]
      );
      if (orderResult.rowCount === 1) {
        const order = orderResult.rows[0];
        await client.query("UPDATE deposit_orders SET status='paid', paid_at=NOW(), sepay_transaction_id=$2 WHERE id=$1", [order.id, transactionId]);
        await client.query('UPDATE users SET balance=balance+$1 WHERE username=$2', [order.credit_amount, order.username]);
        await client.query(
          `INSERT INTO wallet_transactions(username,type,amount,description) VALUES($1,'deposit_credit',$2,$3)`,
          [order.username, order.credit_amount, `Nạp tiền tự động qua SePay · đơn ${order.id}`]
        );
      }
      await client.query('COMMIT');
      return res.status(200).json({ success: true, matched: orderResult.rowCount === 1 });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Xử lý SePay webhook:', error.message);
      return res.status(500).json({ success: false });
    } finally { client.release(); }
  });

  return router;
};
