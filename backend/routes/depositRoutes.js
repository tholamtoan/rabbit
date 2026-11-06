const express = require('express');
const crypto = require('node:crypto');

module.exports = function createDepositRoutes({ pool, requireAuth }) {
  const router = express.Router();

  // Create a deposit order with an exact amount and a unique HCT + 10-hex-character code.
  router.post('/api/deposits/orders', requireAuth, async (req, res) => {
    const creditAmount = Number(req.body?.amount);
    if (!Number.isSafeInteger(creditAmount) || creditAmount < 1 || creditAmount > 50000000) {
      return res.status(400).json({ message: 'Số tiền nạp phải lớn hơn 0đ và không vượt quá 50.000.000đ.' });
    }
    try {
      let inserted;
      for (let attempt = 0; attempt < 5; attempt++) {
        const orderCode = `HCT${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        try {
          inserted = await pool.query(
            `INSERT INTO deposit_orders(username,credit_amount,transfer_amount,suffix,order_code,status,expires_at)
             VALUES($1,$2,$2,0,$3,'pending',NOW()+INTERVAL '20 minutes')
             RETURNING id,credit_amount,transfer_amount,order_code,status,expires_at`,
            [req.user.username, creditAmount, orderCode]
          );
          break;
        } catch (error) {
          if (error.code !== '23505' || attempt === 4) throw error;
        }
      }
      return res.status(201).json({ order: inserted.rows[0], bank: 'BIDV', account: process.env.SEPAY_VA_ACCOUNT || '96247THOLAMTOAN' });
    } catch (error) {
      console.error('Tạo đơn nạp:', error.message);
      return res.status(500).json({ message: 'Không tạo được đơn nạp. Vui lòng thử lại.' });
    }
  });

  // Cancel only an unpaid pending order. A later bank transfer for a cancelled code
  // is deliberately not auto-credited; the webhook will flag it for manual review.
  router.post('/api/deposits/orders/:orderCode/cancel', requireAuth, async (req, res) => {
    const orderCode = String(req.params.orderCode || '').toUpperCase();
    if (!/^HCT[0-9A-F]{10}$/.test(orderCode)) {
      return res.status(400).json({ message: 'Mã đơn nạp không hợp lệ.' });
    }
    try {
      const result = await pool.query(
        `UPDATE deposit_orders SET status='cancelled'
         WHERE order_code=$1 AND username=$2 AND status='pending'
         RETURNING id,order_code,status`,
        [orderCode, req.user.username]
      );
      if (result.rowCount) return res.json({ success: true, order: result.rows[0] });
      const existing = await pool.query(
        `SELECT status FROM deposit_orders WHERE order_code=$1 AND username=$2`,
        [orderCode, req.user.username]
      );
      if (!existing.rowCount) return res.status(404).json({ message: 'Không tìm thấy đơn nạp.' });
      return res.status(409).json({ message: existing.rows[0].status === 'paid' ? 'Đơn đã thanh toán, không thể hủy.' : 'Đơn không còn ở trạng thái chờ thanh toán.' , status: existing.rows[0].status });
    } catch (error) {
      console.error('Hủy đơn nạp:', error.message);
      return res.status(500).json({ message: 'Không hủy được đơn nạp. Vui lòng thử lại.' });
    }
  });

  router.get('/api/deposits/orders/current', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id,credit_amount,transfer_amount,order_code,status,expires_at,created_at FROM deposit_orders
         WHERE username=$1 ORDER BY created_at DESC LIMIT 10`, [req.user.username]
      );
      res.json({ orders: result.rows });
    } catch (error) {
      console.error('Lấy lịch sử đơn nạp:', error.message);
      res.status(500).json({ message: 'Không tải được lịch sử nạp tiền.' });
    }
  });

  // SePay webhook. Keep API Key authentication enabled in SePay and use the same
  // value in SEPAY_WEBHOOK_API_KEY on Render.
  router.post('/api/webhooks/sepay', async (req, res) => {
    const expected = process.env.SEPAY_WEBHOOK_API_KEY || '';
    const auth = String(req.headers.authorization || '');
    const supplied = auth.startsWith('Apikey ') ? auth.slice(7) : '';
    const suppliedBuf = Buffer.from(supplied);
    const expectedBuf = Buffer.from(expected);
    if (!expected || suppliedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(suppliedBuf, expectedBuf)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const payload = req.body || {};
    const transactionId = String(payload.id ?? '').trim();
    const transferAmount = Number(payload.transferAmount);
    const transferType = String(payload.transferType || '').toLowerCase();
    if (!transactionId || transactionId === '0' ||
        !Number.isSafeInteger(transferAmount) || transferAmount <= 0 ||
        transferType !== 'in') {
      return res.status(200).json({ success: true, ignored: true });
    }

    const rawContent = String(payload.content || payload.description || payload.transferContent || '');
    const normalizedContent = rawContent.toUpperCase().replace(/\s+/g, ' ').trim();
    // Website-generated codes are HCT followed by exactly 10 hexadecimal characters.
    const codeMatch = normalizedContent.match(/(?:^|[^A-Z0-9])(HCT[0-9A-F]{10})(?=$|[^A-Z0-9])/);
    const orderCode = codeMatch?.[1] || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert the bank transaction first. The unique transaction_id constraint plus
      // ON CONFLICT makes concurrent/retried webhook deliveries idempotent.
      const recorded = await client.query(
        `INSERT INTO sepay_transactions(transaction_id,transfer_amount,content,reference_code,payload,matched_order_id)
         VALUES($1,$2,$3,$4,$5::jsonb,NULL)
         ON CONFLICT (transaction_id) DO NOTHING
         RETURNING transaction_id`,
        [
          transactionId,
          transferAmount,
          rawContent,
          String(payload.referenceCode || ''),
          JSON.stringify(payload)
        ]
      );

      if (!recorded.rowCount) {
        await client.query('COMMIT');
        return res.status(200).json({ success: true, duplicate: true });
      }

      if (!orderCode) {
        await client.query('COMMIT');
        return res.status(200).json({ success: true, matched: false, reviewRequired: true, reason: 'missing_or_invalid_order_code' });
      }

      // Lock the order even when expired/already paid. This prevents two different
      // bank transactions carrying the same code from crediting the wallet twice.
      const orderResult = await client.query(
        `SELECT * FROM deposit_orders WHERE order_code=$1 FOR UPDATE`,
        [orderCode]
      );

      if (!orderResult.rowCount) {
        await client.query('COMMIT');
        return res.status(200).json({ success: true, matched: false, reviewRequired: true, reason: 'order_not_found' });
      }

      const order = orderResult.rows[0];
      await client.query(
        `UPDATE sepay_transactions SET matched_order_id=$2 WHERE transaction_id=$1`,
        [transactionId, order.id]
      );

      if (order.status === 'paid') {
        await client.query('COMMIT');
        return res.status(200).json({ success: true, matched: true, alreadyPaid: true, credited: false });
      }

      const amountMatches = Number(order.transfer_amount) === transferAmount;
      const isPending = order.status === 'pending';
      const isNotExpired = new Date(order.expires_at).getTime() > Date.now();

      if (!isPending || !isNotExpired || !amountMatches) {
        // Never auto-credit late, mismatched, or otherwise non-pending payments.
        // Keep the order visible for manual reconciliation instead of losing the record.
        await client.query(
          `UPDATE deposit_orders SET status='manual_review' WHERE id=$1 AND status <> 'paid'`,
          [order.id]
        );
        await client.query('COMMIT');
        return res.status(200).json({
          success: true,
          matched: true,
          credited: false,
          reviewRequired: true,
          reason: !amountMatches ? 'amount_mismatch' : (!isNotExpired ? 'order_expired' : 'order_not_pending')
        });
      }

      // Credit, mark paid, and write the wallet ledger in one DB transaction.
      await client.query(
        `UPDATE deposit_orders SET status='paid', paid_at=NOW(), sepay_transaction_id=$2 WHERE id=$1`,
        [order.id, transactionId]
      );
      const credited = await client.query(
        `UPDATE users SET balance=balance+$1 WHERE username=$2 RETURNING username`,
        [order.credit_amount, order.username]
      );
      if (!credited.rowCount) throw new Error(`Không tìm thấy tài khoản nhận tiền cho đơn ${order.id}`);

      await client.query(
        `INSERT INTO wallet_transactions(username,type,amount,description)
         VALUES($1,'deposit_credit',$2,$3)`,
        [order.username, order.credit_amount, `Nạp tiền tự động qua SePay · đơn ${order.id} · GD ${transactionId}`]
      );

      await client.query('COMMIT');
      return res.status(200).json({ success: true, matched: true, credited: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Xử lý SePay webhook:', error.message);
      return res.status(500).json({ success: false });
    } finally {
      client.release();
    }
  });

  return router;
};
