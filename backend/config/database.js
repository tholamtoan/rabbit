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
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id UUID PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      answer_key JSONB NOT NULL, explanations JSONB NOT NULL DEFAULT '{}'::jsonb,
      total_questions INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, submitted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS exam_attempts_user_created_idx ON exam_attempts(username, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users (LOWER(username));
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (LOWER(email));
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
  console.log('PostgreSQL connected; users, sessions, wallet and exam tables are ready.');
}

module.exports = { pool, initializeDatabase };
