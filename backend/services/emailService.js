// Gửi OTP qua Gmail API HTTPS.
let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64Url(input) {
  return Buffer.from(input, 'utf8').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function getGmailAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpiresAt - 60_000) {
    return cachedAccessToken;
  }

  const required = ['GMAIL_USER', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    const error = new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
    error.code = 'GMAIL_CONFIG_MISSING';
    throw error;
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error_description || data.error || `OAuth token HTTP ${response.status}`);
    error.code = data.error || `OAUTH_HTTP_${response.status}`;
    throw error;
  }

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + (Number(data.expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

async function sendOtpEmail(to, otpCode) {
  const from = process.env.GMAIL_USER;
  const accessToken = await getGmailAccessToken();
  const subject = 'Mã xác thực OTP - Học cùng Thỏ';
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; max-width: 500px;">
      <h2 style="color: #7c3aed;">🐰 Học cùng Thỏ - Mã Xác Thực OTP</h2>
      <p>Mã OTP dùng để xác thực tài khoản của bạn là:</p>
      <div style="background-color: #f3e8ff; color: #6b21a8; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">${otpCode}</div>
      <p style="color: #6b7280; font-size: 13px;">Mã có hiệu lực trong vòng 3 phút.</p>
    </div>`;
  const mime = [
    `From: =?UTF-8?B?${Buffer.from('Học cùng Thỏ', 'utf8').toString('base64')}?= <${from}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64')
  ].join('\r\n');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64Url(mime) }),
    signal: AbortSignal.timeout(20_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `Gmail API HTTP ${response.status}`);
    error.code = data.error?.status || `GMAIL_HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

module.exports = { sendOtpEmail };
