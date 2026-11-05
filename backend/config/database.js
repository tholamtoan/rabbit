const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Thiếu DATABASE_URL. Hãy cấu hình biến này trên Render.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Migrate older Neon databases safely before auth middleware reads users.status.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_status_check'
          AND conrelid = 'users'::regclass
      ) THEN
        ALTER TABLE users
          ADD CONSTRAINT users_status_check
          CHECK (status IN ('active', 'suspended'));
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS admin_roles (
      username TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'support')),
      granted_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id BIGSERIAL PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
      ON admin_audit_log(created_at DESC);
    CREATE TABLE IF NOT EXISTS subject_settings (
      subject_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS exam_subject_settings (
      subject_id TEXT PRIMARY KEY,
      question_count INTEGER NOT NULL CHECK (question_count >= 1),
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1),
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id BIGSERIAL PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('exam_purchase','admin_credit','admin_debit')),
      amount NUMERIC(14,2) NOT NULL CHECK (amount > 0), description TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS wallet_transactions_username_created_idx ON wallet_transactions(username, created_at DESC);
    -- Allow zero-value wallet entries so free exams (price = 0) can be purchased.
    ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check CHECK (type IN ('exam_purchase','admin_credit','admin_debit','deposit_credit'));
    ALTER TABLE wallet_transactions
      DROP CONSTRAINT IF EXISTS wallet_transactions_amount_check;
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_amount_check CHECK (amount >= 0);
    CREATE TABLE IF NOT EXISTS deposit_orders (
      id BIGSERIAL PRIMARY KEY,
      username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      credit_amount BIGINT NOT NULL CHECK (credit_amount >= 1),
      transfer_amount BIGINT NOT NULL,
      suffix SMALLINT NOT NULL DEFAULT 0 CHECK (suffix BETWEEN 0 AND 99),
      order_code TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','manual_review')),
      expires_at TIMESTAMPTZ NOT NULL,
      paid_at TIMESTAMPTZ,
      sepay_transaction_id TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Remove the old minimum top-up restriction (10,000 VND); any positive integer is accepted.
    ALTER TABLE deposit_orders DROP CONSTRAINT IF EXISTS deposit_orders_credit_amount_check;
    ALTER TABLE deposit_orders ADD CONSTRAINT deposit_orders_credit_amount_check CHECK (credit_amount >= 1);
    -- Migrate existing installations from amount-suffix matching to unique transfer content codes.
    ALTER TABLE deposit_orders ADD COLUMN IF NOT EXISTS order_code TEXT;
    ALTER TABLE deposit_orders ALTER COLUMN suffix SET DEFAULT 0;
    ALTER TABLE deposit_orders DROP CONSTRAINT IF EXISTS deposit_orders_suffix_check;
    ALTER TABLE deposit_orders ADD CONSTRAINT deposit_orders_suffix_check CHECK (suffix BETWEEN 0 AND 99);
    ALTER TABLE deposit_orders DROP CONSTRAINT IF EXISTS deposit_orders_transfer_amount_key;
    CREATE UNIQUE INDEX IF NOT EXISTS deposit_orders_order_code_uidx ON deposit_orders(order_code) WHERE order_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS deposit_orders_user_created_idx ON deposit_orders(username, created_at DESC);
    CREATE INDEX IF NOT EXISTS deposit_orders_pending_idx ON deposit_orders(order_code, expires_at) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS sepay_transactions (
      transaction_id TEXT PRIMARY KEY,
      transfer_amount BIGINT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      reference_code TEXT NOT NULL DEFAULT '',
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      matched_order_id BIGINT REFERENCES deposit_orders(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id UUID PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      answer_key JSONB NOT NULL, explanations JSONB NOT NULL DEFAULT '{}'::jsonb,
      total_questions INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS exam_attempts_user_created_idx ON exam_attempts(username, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users (LOWER(username));
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email));
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_by TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pricing_audit_log (
      id BIGSERIAL PRIMARY KEY,
      setting_key TEXT NOT NULL,
      old_value JSONB NOT NULL,
      new_value JSONB NOT NULL,
      changed_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pricing_audit_log_created_idx ON pricing_audit_log(created_at DESC);
    CREATE TABLE IF NOT EXISTS otp_challenges (
      email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('register','reset_password')),
      otp_hash TEXT NOT NULL,
      temp_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      resend_after TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (email, purpose)
    );
    CREATE TABLE IF NOT EXISTS otp_send_events (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      ip TEXT NOT NULL,
      purpose TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS otp_send_events_email_created_idx ON otp_send_events(email, created_at DESC);
    CREATE INDEX IF NOT EXISTS otp_send_events_ip_created_idx ON otp_send_events(ip, created_at DESC);
  `);
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ('exam_price', to_jsonb($1::numeric)) ON CONFLICT (key) DO NOTHING`,
    [Number(require('./pricing').EXAM_PRICE)]
  );
  console.log('PostgreSQL connected; wallet, deposit orders, SePay transactions and app settings are ready.');
}

module.exports = { pool, initializeDatabase };
