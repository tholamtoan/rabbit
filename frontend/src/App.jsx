import { useState, useEffect, useRef, useCallback } from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import './App.css';

const API_BASE = 'https://rabbit-backend-68j4.onrender.com/api';

function MathContent({ value = '', inline = false }) {
  const source = String(value ?? '')
    .replace(/\r\n/g, '\n')
    // Một số dữ liệu import có dấu phân cách LaTeX bị escape hai lần.
    .replace(/\\\\\(/g, '\\(')
    .replace(/\\\\\)/g, '\\)')
    .replace(/\\\\\[/g, '\\[')
    .replace(/\\\\\]/g, '\\]');

  const parts = [];
  let key = 0;
  const pushPlainText = (plainText) => {
    const scientificPattern = /([−-]?\d+(?:[,.]\d+)?)\s*[×x]\s*10\s*(?:\^\s*\{?\s*([−-]?\s*\d+)\s*\}?|([−-]\s*\d+))|(^|[^\w\\])10\s*(?:\^\s*\{?\s*([−-]?\s*\d+)\s*\}?|([−-]\s*\d+))/g;
    let cursor = 0;
    let scientificMatch;

    while ((scientificMatch = scientificPattern.exec(plainText)) !== null) {
      if (scientificMatch.index > cursor) {
        parts.push({ type: 'text', value: plainText.slice(cursor, scientificMatch.index), key: key++ });
      }

      let coefficient;
      let exponent;
      let prefix = '';
      if (scientificMatch[1] !== undefined) {
        coefficient = scientificMatch[1].replace('−', '-').replace(',', '{,}');
        exponent = (scientificMatch[2] ?? scientificMatch[3]).replace(/[\s−]/g, (char) => char === '−' ? '-' : '');
      } else {
        prefix = scientificMatch[4] ?? '';
        exponent = (scientificMatch[5] ?? scientificMatch[6]).replace(/[\s−]/g, (char) => char === '−' ? '-' : '');
      }

      if (prefix) parts.push({ type: 'text', value: prefix, key: key++ });
      const latex = coefficient
        ? `${coefficient}\\times 10^{${exponent}}`
        : `10^{${exponent}}`;
      parts.push({ type: 'inline', value: latex, key: key++ });
      cursor = scientificPattern.lastIndex;
    }

    if (cursor < plainText.length) {
      parts.push({ type: 'text', value: plainText.slice(cursor), key: key++ });
    }
  };

  const tokenRegex = /\\{1,2}\[([\s\S]*?)\\{1,2}\]|\\{1,2}\(([\s\S]*?)\\{1,2}\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      pushPlainText(source.slice(lastIndex, match.index));
    }

    const isBlock = match[1] !== undefined || match[3] !== undefined;
    const latex = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '')
      .replace(/\\begin\{align\*?\}/g, '\\begin{aligned}')
      .replace(/\\end\{align\*?\}/g, '\\end{aligned}')
      // Chuẩn hóa lệnh LaTeX bị escape lặp, nhưng giữ nguyên \\ xuống dòng trong môi trường căn chỉnh.
      .replace(/\\\\(?=[a-zA-Z])/g, '\\')
      .trim();

    const hasTallMath = /\\(?:d?frac|tfrac|int|sum|prod|lim|sqrt|root)\b/.test(latex);
    const renderedLatex = inline && hasTallMath && !/\\displaystyle\b/.test(latex)
      ? `\\displaystyle ${latex}`
      : latex;

    parts.push({
      type: !inline && isBlock ? 'block' : 'inline',
      value: renderedLatex,
      key: key++,
    });
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < source.length) {
    pushPlainText(source.slice(lastIndex));
  }
  if (parts.length === 0) {
    pushPlainText(source);
  }

  return (
    <>
      {parts.map((part) => {
        if (part.type === 'block') {
          return (
            <div className="math-block" key={part.key}>
              <BlockMath math={part.value} errorColor="#d32f2f" />
            </div>
          );
        }
        if (part.type === 'inline') {
          return <InlineMath key={part.key} math={part.value} errorColor="#d32f2f" />;
        }
        return <span key={part.key}>{part.value}</span>;
      })}
    </>
  );
}

function RabbitLogo() {
  return (
    <div className="rabbit-logo">
      <div className="logo-icon-wrapper">
        <svg className="rabbit-mark" viewBox="0 0 100 100" role="img" aria-label="Logo thỏ Học cùng Thỏ">
          <path d="M31 43 C23 25 23 5 34 5 C45 5 47 24 47 40" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M55 40 C54 22 59 5 70 7 C82 9 77 29 68 45" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M33 32 C29 19 30 12 34 12 C39 12 40 24 41 34" fill="#f5a9d2" />
          <path d="M61 34 C63 21 67 13 71 14 C76 16 70 29 66 37" fill="#f5a9d2" />
          <path d="M18 58 C18 39 32 29 50 29 C69 29 83 41 83 59 C83 79 69 92 50 92 C31 92 18 78 18 58Z" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" />
          <ellipse cx="33" cy="66" rx="8" ry="5" fill="#f7bfdc" />
          <ellipse cx="67" cy="66" rx="8" ry="5" fill="#f7bfdc" />
          <ellipse cx="39" cy="57" rx="3.2" ry="4.4" fill="#49345d" />
          <ellipse cx="61" cy="57" rx="3.2" ry="4.4" fill="#49345d" />
          <path d="M46 65 Q50 61 54 65 Q50 71 46 65Z" fill="#e88ab8" />
          <path d="M50 70 Q46 76 41 72 M50 70 Q54 76 59 72" fill="none" stroke="#745080" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27 61 L21 59 M73 61 L79 59" stroke="#d99ac4" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="logo-texts">
        <h1>Học cùng Thỏ</h1>
        <span>Hệ thống tự luyện tập & kiểm tra kiến thức</span>
      </div>
    </div>
  );
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Máy chủ trả về dữ liệu không hợp lệ (${response.status}).`);
  }
  if (!response.ok) {
    const error = new Error(data?.message || `Lỗi máy chủ (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export default function App() {
  const [step, setStep] = useState('auth'); 
  const [authMode, setAuthMode] = useState('login'); // 'login', 'register', 'verify-otp', 'forgot', 'reset-otp'

  const [loginKeyInput, setLoginKeyInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [emailOrPhoneInput, setEmailOrPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmNewPasswordInput, setConfirmNewPasswordInput] = useState('');

  const [userId, setUserId] = useState('');
  const [walletBalance, setWalletBalance] = useState(0);
  const [depositAmount, setDepositAmount] = useState('100000');
  const [depositOrder, setDepositOrder] = useState(null);
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositMessage, setDepositMessage] = useState('');
  const [depositNow, setDepositNow] = useState(Date.now());
  const [showDepositPanel, setShowDepositPanel] = useState(false);
  const [examPrice, setExamPrice] = useState(1000);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPricing, setShowAdminPricing] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState('overview');
  const [adminDashboard, setAdminDashboard] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminUserQuery, setAdminUserQuery] = useState('');
  const [adminTransactions, setAdminTransactions] = useState([]);
  const [adminAudit, setAdminAudit] = useState([]);
  const [adminCatalog, setAdminCatalog] = useState([]);
  const [adminExamSettings, setAdminExamSettings] = useState([]);
  const [adminRoles, setAdminRoles] = useState([]);
  const [adminRoleUsername, setAdminRoleUsername] = useState('');
  const [adminRoleType, setAdminRoleType] = useState('support');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminPriceInput, setAdminPriceInput] = useState('1000');
  const [adminPriceSaving, setAdminPriceSaving] = useState(false);

  const [universities, setUniversities] = useState([]);
  const [selectedUni, setSelectedUni] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [currentSubject, setCurrentSubject] = useState(null);
  const [examData, setExamData] = useState(null);
  const [userAnswers, setUserAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [usernameAvailability, setUsernameAvailability] = useState({ status: 'idle', message: '' });
  const [emailAvailability, setEmailAvailability] = useState({ status: 'idle', message: '' });
  const usernameCheckRef = useRef(0);
  const emailCheckRef = useRef(0);

  const checkRegistrationField = async (field, rawValue) => {
    const value = String(rawValue || '').trim();
    const setAvailability = field === 'username' ? setUsernameAvailability : setEmailAvailability;
    const checkRef = field === 'username' ? usernameCheckRef : emailCheckRef;
    const requestId = ++checkRef.current;
    if (!value) { setAvailability({ status: 'idle', message: '' }); return; }
    setAvailability({ status: 'checking', message: 'Đang kiểm tra...' });
    try {
      const data = await fetchJson(`${API_BASE}/auth/check-registration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value })
      });
      if (requestId === checkRef.current) setAvailability({ status: 'available', message: data.message || 'Có thể sử dụng.' });
    } catch (err) {
      if (requestId === checkRef.current) setAvailability({ status: err.status === 409 ? 'taken' : 'error', message: err.message });
    }
  };


  useEffect(() => {
    let cancelled = false;
    const refreshPrice = () => fetchJson(`${API_BASE}/config/pricing`)
      .then((data) => {
        const value = Number(data?.examPrice);
        if (!cancelled && Number.isSafeInteger(value) && value >= 0) setExamPrice(value);
      })
      .catch((err) => console.error('Không tải được cấu hình giá:', err));
    refreshPrice();
    // Các tab đang mở cũng nhận giá mới tối đa sau 30 giây.
    const timer = window.setInterval(refreshPrice, 30_000);
    const onFocus = () => refreshPrice();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => setOtpCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [otpCooldown > 0]);
  
  const [tabViolationCount, setTabViolationCount] = useState(0);
  const [violationNotice, setViolationNotice] = useState('');
  const [preExamSubject, setPreExamSubject] = useState(null);
  const [purchaseSubject, setPurchaseSubject] = useState(null);
  const [termSubject, setTermSubject] = useState(null);
  const [selectedExamTerm, setSelectedExamTerm] = useState('midterm');
  const [incompleteSubmitNotice, setIncompleteSubmitNotice] = useState('');

  const answersRef = useRef({});
  const examRef = useRef(null);
  const submitLock = useRef(false);
  const tabViolationCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const MAX_TAB_VIOLATIONS = 3;

  // 1. Đăng nhập
  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!loginKeyInput.trim() || !passwordInput.trim()) {
      setError('Vui lòng nhập tài khoản và mật khẩu!');
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginKey: loginKeyInput, password: passwordInput })
      });

      if (data.token) localStorage.setItem('hct_session_token', data.token);
      setUserId(data.userId);
      setWalletBalance(data.balance || 0);
      setIsAdmin(Boolean(data.isAdmin));
      setStep('select-uni');
      setPasswordInput('');
      setLoginKeyInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Gửi OTP Đăng ký
  const handleRequestRegisterOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!usernameInput.trim() || !emailOrPhoneInput.trim() || !passwordInput.trim() || !confirmPasswordInput.trim()) {
      setError('Vui lòng điền đầy đủ tất cả các trường!');
      return;
    }

    if (usernameAvailability.status === 'taken' || emailAvailability.status === 'taken') {
      setError(usernameAvailability.status === 'taken' ? usernameAvailability.message : emailAvailability.message);
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setError('Mật khẩu nhập lại không khớp!');
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          emailOrPhone: emailOrPhoneInput,
          password: passwordInput,
          confirmPassword: confirmPasswordInput,
          isRegister: true
        })
      });

      setSuccessMessage(data.message);
      setOtpInput('');
      setOtpCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Xác thực OTP đăng ký
  const handleVerifyRegisterOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!otpInput.trim()) {
      setError('Vui lòng nhập mã OTP!');
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/auth/verify-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailOrPhoneInput, otp: otpInput })
      });

      if (data.token) localStorage.setItem('hct_session_token', data.token);
      setUserId(data.userId);
      setWalletBalance(data.balance || 0);
      setIsAdmin(Boolean(data.isAdmin));
      setStep('select-uni');
      setOtpInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Gửi OTP Quên mật khẩu
  const handleRequestForgotOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!emailOrPhoneInput.trim()) {
      setError('Vui lòng nhập email liên kết!');
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrPhone: emailOrPhoneInput, isRegister: false })
      });

      setSuccessMessage(data.message);
      setOtpInput('');
      setOtpCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Xác thực OTP & đổi mật khẩu mới
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!otpInput.trim() || !newPasswordInput.trim() || !confirmNewPasswordInput.trim()) {
      setError('Vui lòng điền đầy đủ thông tin đặt lại mật khẩu!');
      return;
    }

    if (newPasswordInput !== confirmNewPasswordInput) {
      setError('Mật khẩu mới nhập lại không khớp!');
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailOrPhone: emailOrPhoneInput,
          otp: otpInput,
          newPassword: newPasswordInput,
          confirmNewPassword: confirmNewPasswordInput
        })
      });

      setSuccessMessage(data.message);
      setAuthMode('login');
      setOtpInput('');
      setNewPasswordInput('');
      setConfirmNewPasswordInput('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const createDepositOrder = async () => {
    setDepositBusy(true); setDepositMessage(''); setDepositOrder(null);
    try {
      const token = localStorage.getItem('hct_session_token');
      const data = await fetchJson(`${API_BASE}/deposits/orders`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ amount: Number(depositAmount) })
      });
      setDepositOrder(data.order);
      setDepositMessage('Đơn nạp đã tạo. Quét QR để chuyển đúng số tiền; mã đơn đã được điền sẵn trong nội dung.');
    } catch (err) { setDepositMessage(err.message); }
    finally { setDepositBusy(false); }
  };

  const getDepositQrUrl = (order) => `https://qr.sepay.vn/img?bank=BIDV&acc=96247THOLAMTOAN&amount=${order.transfer_amount}&des=${encodeURIComponent(order.order_code)}`;

  const copyDepositCode = async () => {
    if (!depositOrder?.order_code) return;
    try {
      await navigator.clipboard.writeText(depositOrder.order_code);
      setDepositMessage('Đã sao chép mã đơn. Nếu ứng dụng ngân hàng không tự điền nội dung, hãy dán mã này vào ô nội dung chuyển khoản.');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = depositOrder.order_code;
      textArea.style.position = 'fixed'; textArea.style.opacity = '0';
      document.body.appendChild(textArea); textArea.select();
      const copied = document.execCommand('copy'); textArea.remove();
      setDepositMessage(copied ? 'Đã sao chép mã đơn. Nếu ứng dụng ngân hàng không tự điền nội dung, hãy dán mã này vào ô nội dung chuyển khoản.' : `Mã đơn: ${depositOrder.order_code}. Hãy sao chép mã này để dán vào nội dung chuyển khoản nếu ngân hàng không tự điền.`);
    }
  };

  const saveDepositQr = async () => {
    if (!depositOrder) return;
    const qrUrl = getDepositQrUrl(depositOrder);
    // Mở sẵn tab đồng bộ với thao tác bấm để tránh trình duyệt chặn popup ở bước dự phòng.
    const preview = window.open('about:blank', '_blank');
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error('Không tải được ảnh QR');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      if (preview) preview.close();
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `QR-nap-tien-${depositOrder.order_code}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
      setDepositMessage('Đã yêu cầu tải ảnh QR về thiết bị. Nếu điện thoại mở ảnh thay vì tải, hãy nhấn giữ ảnh và chọn Lưu hình ảnh.');
    } catch {
      if (preview) preview.location.href = qrUrl;
      else window.location.href = qrUrl;
      setDepositMessage('Trình duyệt không cho tải ảnh trực tiếp. Ảnh QR đã được mở; trên điện thoại hãy nhấn giữ ảnh và chọn Lưu hình ảnh.');
    }
  };

  useEffect(() => {
    if (!depositOrder?.expires_at) return;
    const timer = window.setInterval(() => setDepositNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [depositOrder?.expires_at]);

  const fetchWalletBalance = useCallback(async () => {
    if (!userId) return;
    try {
      const token = localStorage.getItem('hct_session_token');
      const data = await fetchJson(`${API_BASE}/wallet`, { headers: { Authorization: `Bearer ${token}` } });
      setWalletBalance(data.balance || 0);
    } catch (err) {
      console.error("Lỗi lấy số dư ví:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) fetchWalletBalance();
  }, [userId, fetchWalletBalance]);

  // Restore login after F5 using a server-validated, expiring session token.
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('hct_session_token');
    if (!token) {
      setAuthReady(true);
      return undefined;
    }
    fetchJson(`${API_BASE}/auth/session`, { headers: { Authorization: `Bearer ${token}` } })
      .then((data) => {
        if (cancelled) return;
        setUserId(data.userId);
        setWalletBalance(Number(data.balance) || 0);
        setIsAdmin(Boolean(data.isAdmin));
        setStep('select-uni');
      })
      .catch(() => {
        if (!cancelled) localStorage.removeItem('hct_session_token');
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`${API_BASE}/universities`)
      .then((data) => { if (!cancelled) setUniversities(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(`Không tải được danh sách trường: ${err.message}`); });
    return () => { cancelled = true; };
  }, []);

  const handleSelectUni = async (uni) => {
    setSelectedUni(uni);
    setError('');
    setIsLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/universities/${uni.id}/subjects`);
      setSubjects(Array.isArray(data) ? data : []);
      setStep('select-subject');
      fetchWalletBalance();
    } catch (err) {
      setError(`Không tải được danh sách môn: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Luôn hiển thị xác nhận giá và số dư trước khi chuyển sang quy chế thi.
  // Chưa có giao dịch/trừ tiền ở bước mở hộp thoại này.
  const handleBuyAndStartExam = (subject) => {
    setPurchaseSubject(subject);
  };

  const confirmPurchasePrompt = () => {
    if (!purchaseSubject) return;
    if (walletBalance < examPrice) {
      alert(`Số dư không đủ. Giá đề ${examPrice.toLocaleString('vi-VN')}đ, số dư hiện tại ${walletBalance.toLocaleString('vi-VN')}đ. Vui lòng nạp thêm tiền.`);
      return;
    }
    const selected = purchaseSubject;
    setPurchaseSubject(null);
    setPreExamSubject(selected);
  };

  const confirmStartExam = async () => {
    const subject = preExamSubject;
    if (!subject) return;
    if (walletBalance < examPrice) {
      setPreExamSubject(null);
      alert(`Số dư không đủ! Bạn hiện có ${walletBalance.toLocaleString('vi-VN')}đ.`);
      return;
    }

    // requestFullscreen phải được gọi trực tiếp từ thao tác bấm của người dùng.
    try {
      if (!document.fullscreenElement) {
        if (!document.documentElement.requestFullscreen) {
          throw new Error('Trình duyệt không hỗ trợ chế độ toàn màn hình.');
        }
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      setError(`Không bật được toàn màn hình: ${err.message || 'Hãy cho phép trình duyệt bật toàn màn hình rồi thử lại.'}`);
      return;
    }

    setPreExamSubject(null);
    setIsLoading(true);
    try {
      const buyRes = await fetchJson(`${API_BASE}/exam/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hct_session_token') || ''}` },
        body: JSON.stringify({ subjectId: subject.id, examTerm: selectedExamTerm })
      });
      if (buyRes.success) {
        setWalletBalance(buyRes.newBalance);
        await handleStartRandomExam(subject, selectedExamTerm);
      }
    } catch (err) {
      setError(`Không mua được đề: ${err.message}`);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRandomExam = async (subject, examTerm = selectedExamTerm) => {
    setCurrentSubject(subject);
    setError('');
    setIsLoading(true);
    setViolationNotice('');
    setIncompleteSubmitNotice('');
    setTabViolationCount(0);
    tabViolationCountRef.current = 0;
    lastViolationAtRef.current = 0;
    submitLock.current = false;


    try {
      const data = await fetchJson(`${API_BASE}/exam/random/${subject.id}?term=${encodeURIComponent(examTerm)}`, { headers: { Authorization: `Bearer ${localStorage.getItem('hct_session_token') || ''}` } });
      setExamData(data);
      examRef.current = data;
      setTimeLeft(Math.max(0, Number(data.durationMinutes) || 0) * 60);
      setUserAnswers({});
      answersRef.current = {};
      setResult(null);
      setIsSubmitted(false);
      setStep('doing-exam');
    } catch (err) {
      setError(`Không tạo được đề thi: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = useCallback(async (answersOverride, { allowIncomplete = false } = {}) => {
    const currentExam = examRef.current;
    if (submitLock.current || !currentExam) return;

    const answersToSubmit = answersOverride ?? answersRef.current;
    const firstUnansweredIndex = currentExam.questions.findIndex(q => !answersToSubmit[q.id]);

    if (firstUnansweredIndex !== -1 && !allowIncomplete) {
      setIncompleteSubmitNotice(`Bạn chưa hoàn thành bài thi! Còn câu chưa trả lời.`);
      document.getElementById(`question-card-${firstUnansweredIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitLock.current = true;
    setError('');
    setIsLoading(true);

    try {
      const data = await fetchJson(`${API_BASE}/exam/submit-random`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hct_session_token') || ''}` },
        body: JSON.stringify({ attemptId: currentExam.attemptId, userAnswers: answersToSubmit })
      });
      setResult(data);
      setIncompleteSubmitNotice('');
      setIsSubmitted(true);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      submitLock.current = false;
      setError(`Không nộp được bài: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 'doing-exam' || isSubmitted) return undefined;
    const registerViolation = (reason) => {
      if (submitLock.current || tabViolationCountRef.current >= MAX_TAB_VIOLATIONS) return;
      // blur + fullscreenchange/visibilitychange có thể cùng phát sinh cho một thao tác.
      // Gộp chúng thành một lần vi phạm trong khoảng 1,5 giây.
      const now = Date.now();
      if (now - lastViolationAtRef.current < 1500) return;
      lastViolationAtRef.current = now;

      const nextCount = tabViolationCountRef.current + 1;
      tabViolationCountRef.current = nextCount;
      setTabViolationCount(nextCount);

      if (nextCount >= MAX_TAB_VIOLATIONS) {
        submitLock.current = true;
        setViolationNotice(`Bài thi đã bị hủy do vi phạm quy chế thi ${MAX_TAB_VIOLATIONS} lần. Bấm nút bên dưới để quay về danh sách môn học.`);
        setStep('select-subject');
        setExamData(null);
        examRef.current = null;
        setUserAnswers({});
        answersRef.current = {};
        setTimeLeft(0);
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        return;
      }
      setViolationNotice(`Cảnh báo vi phạm (${nextCount}/${MAX_TAB_VIOLATIONS}): Bạn vừa ${reason}. Bài thi vẫn được giữ nguyên. Hãy bấm nút bên dưới để quay lại toàn màn hình.`);
    };

    const handleVis = () => { if (!violationNotice && document.visibilityState === 'hidden') registerViolation('rời khỏi tab thi'); };
    const handleBlur = () => { if (!violationNotice) registerViolation('rời khỏi cửa sổ thi'); };
    const handleFull = () => { if (!violationNotice && !document.fullscreenElement) registerViolation('thoát toàn màn hình'); };

    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFull);
    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFull);
    };
  }, [step, isSubmitted, violationNotice]);

  const resumeExamFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      setViolationNotice('');
    } catch (err) {
      setViolationNotice('Trình duyệt chưa cho phép bật toàn màn hình. Hãy bấm lại nút bên dưới để tiếp tục làm bài ở chế độ toàn màn hình.');
    }
  };

  // Người thi có thể chủ động dừng bài khi đang ở hộp cảnh báo.
  // Thoát bài không bị tính thêm vi phạm và luôn đưa giao diện về danh sách môn.
  const stopExamNow = () => {
    submitLock.current = true;
    setViolationNotice('');
    setExamData(null);
    examRef.current = null;
    setUserAnswers({});
    answersRef.current = {};
    setTimeLeft(0);
    setResult(null);
    setIsSubmitted(false);
    setIncompleteSubmitNotice('');
    setStep('select-subject');
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const closeCancelledExamNotice = () => {
    setViolationNotice('');
    setStep('select-subject');
    setExamData(null);
    examRef.current = null;
    setUserAnswers({});
    answersRef.current = {};
    setTimeLeft(0);
  };

  useEffect(() => {
    if (step !== 'doing-exam' || timeLeft <= 0 || isSubmitted || !examData) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void handleSubmit(undefined, { allowIncomplete: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, timeLeft, isSubmitted, examData, handleSubmit]);

  const handleSelectOption = (qId, optKey) => {
    if (isSubmitted) return;
    setUserAnswers(prev => {
      const next = { ...prev, [qId]: optKey };
      answersRef.current = next;
      return next;
    });
  };

  const formatTime = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const handleReset = () => {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    setStep('select-uni');
    setSelectedUni(null);
    setSubjects([]);
    setExamData(null);
    setUserAnswers({});
    setResult(null);
    setIsSubmitted(false);
  };

  const handleLogout = async () => {
    const token = localStorage.getItem('hct_session_token');
    if (token) {
      try {
        await fetchJson(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.warn('Không thể thu hồi phiên trên máy chủ:', err);
      }
    }
    localStorage.removeItem('hct_session_token');
    setUserId('');
    setWalletBalance(0);
    setIsAdmin(false);
    setShowAdminPricing(false);
    setStep('auth');
    setAuthMode('login');
  };


  const adminRequest = async (path, options = {}) => {
    const token = localStorage.getItem('hct_session_token');
    return fetchJson(`${API_BASE}/admin/${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token || ''}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) }
    });
  };

  const loadAdminTab = async (tab = adminTab) => {
    setAdminLoading(true);
    setError('');
    try {
      if (tab === 'overview') setAdminDashboard(await adminRequest('dashboard'));
      if (tab === 'users') setAdminUsers((await adminRequest(`users?q=${encodeURIComponent(adminUserQuery)}`)).users || []);
      if (tab === 'transactions') setAdminTransactions((await adminRequest('transactions')).transactions || []);
      if (tab === 'audit') setAdminAudit((await adminRequest('audit')).logs || []);
      if (tab === 'catalog') setAdminCatalog((await adminRequest('catalog')).subjects || []);
      if (tab === 'examSettings') setAdminExamSettings((await adminRequest('exam-settings')).subjects || []);
      if (tab === 'roles') setAdminRoles((await adminRequest('roles')).roles || []);
      if (tab === 'pricing') {
        const data = await adminRequest('pricing');
        setAdminPriceInput(String(data.examPrice));
        setExamPrice(Number(data.examPrice));
      }
    } catch (err) {
      setError(err.message || 'Không tải được dữ liệu quản trị.');
    } finally { setAdminLoading(false); }
  };

  const openAdminPanel = () => {
    setShowAdminPanel(true);
    setShowAdminPricing(false);
    setAdminTab('overview');
    void loadAdminTab('overview');
  };

  const changeAdminTab = (tab) => {
    setAdminTab(tab);
    void loadAdminTab(tab);
  };

  const adminWalletAction = async (username, direction) => {
    const raw = window.prompt(`${direction === 'credit' ? 'Số tiền cần cộng' : 'Số tiền cần trừ'} cho ${username} (VNĐ):`);
    if (raw === null) return;
    const amount = Number(raw);
    if (!Number.isSafeInteger(amount) || amount <= 0) { setError('Số tiền phải là số nguyên dương.'); return; }
    const description = window.prompt('Lý do điều chỉnh số dư:', 'Điều chỉnh bởi quản trị viên') || 'Điều chỉnh bởi quản trị viên';
    try {
      await adminRequest(`users/${encodeURIComponent(username)}/wallet`, { method: 'POST', body: JSON.stringify({ amount, direction, description }) });
      setSuccessMessage(`Đã ${direction === 'credit' ? 'cộng' : 'trừ'} ${amount.toLocaleString('vi-VN')} VNĐ cho ${username}.`);
      void loadAdminTab('users');
    } catch (err) { setError(err.message); }
  };

  const adminSetUserStatus = async (username, status) => {
    if (!window.confirm(`${status === 'suspended' ? 'Tạm khóa' : 'Mở khóa'} tài khoản ${username}?`)) return;
    try {
      await adminRequest(`users/${encodeURIComponent(username)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      setSuccessMessage(`Đã cập nhật tài khoản ${username}.`);
      void loadAdminTab('users');
    } catch (err) { setError(err.message); }
  };

  const adminToggleSubject = async (subject) => {
    try {
      await adminRequest(`catalog/${encodeURIComponent(subject.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: !subject.enabled }) });
      void loadAdminTab('catalog');
      setSuccessMessage(`Đã ${subject.enabled ? 'ẩn' : 'mở'} môn ${subject.name}.`);
    } catch (err) { setError(err.message); }
  };

  const updateAdminExamSetting = (subjectId, field, value) => {
    setAdminExamSettings(current => current.map(item => item.id === subjectId ? { ...item, [field]: value } : item));
  };

  const saveAdminExamSetting = async (subject) => {
    const questionCount = Number(subject.questionCount);
    const durationMinutes = Number(subject.durationMinutes);
    if (!Number.isInteger(questionCount) || questionCount < 1 || questionCount > subject.bankSize) {
      setError(`Môn ${subject.name}: số câu phải từ 1 đến ${subject.bankSize}.`);
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
      setError(`Môn ${subject.name}: thời gian phải từ 1 đến 360 phút.`);
      return;
    }
    try {
      await adminRequest(`exam-settings/${encodeURIComponent(subject.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ questionCount, durationMinutes })
      });
      setSuccessMessage(`Đã lưu cấu hình ${subject.name}: ${questionCount} câu / ${durationMinutes} phút.`);
      void loadAdminTab('examSettings');
    } catch (err) {
      setError(err.message || 'Không lưu được cấu hình đề thi.');
    }
  };

  const adminGrantRole = async (e) => {
    e.preventDefault();
    try {
      await adminRequest('roles', { method: 'POST', body: JSON.stringify({ username: adminRoleUsername, role: adminRoleType }) });
      setAdminRoleUsername('');
      void loadAdminTab('roles');
      setSuccessMessage('Đã cập nhật phân quyền.');
    } catch (err) { setError(err.message); }
  };

  const handleSaveExamPrice = async (e) => {
    e.preventDefault();
    const amount = Number(adminPriceInput);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000) {
      setError('Giá đề phải là số nguyên từ 0 đến 100.000.000 VNĐ.');
      return;
    }
    setAdminPriceSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const token = localStorage.getItem('hct_session_token');
      const data = await fetchJson(`${API_BASE}/admin/pricing`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ examPrice: amount })
      });
      setExamPrice(Number(data.examPrice));
      setAdminPriceInput(String(data.examPrice));
      setSuccessMessage(data.message || 'Đã cập nhật giá đề thi.');
      setShowAdminPricing(false);
    } catch (err) {
      setError(err.message || 'Không cập nhật được giá đề thi.');
    } finally {
      setAdminPriceSaving(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <RabbitLogo />
          {step !== 'auth' && (
            <div style={{ display: 'flex', gap: '10px' }}>
              {isAdmin && <button className="home-btn" onClick={openAdminPanel} type="button">⚙️ Quản trị Admin</button>}
              <button className="home-btn deposit-nav-btn" onClick={() => { setShowDepositPanel(true); fetchWalletBalance(); }} type="button">💳 Nạp tiền</button>
              <button className="home-btn" onClick={handleReset} type="button">🏠 Trang chủ</button>
              <button className="home-btn" onClick={handleLogout} type="button" style={{ background: '#fee2e2', color: '#dc2626' }}>🚪 Đăng xuất ({userId})</button>
            </div>
          )}
        </div>
      </header>

      {showDepositPanel && step !== 'auth' && (
        <div className="deposit-modal-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setShowDepositPanel(false); }}>
          <section className="deposit-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="deposit-modal-title">
            <div className="deposit-modal-heading">
              <div><h2 id="deposit-modal-title">💳 Nạp tiền vào ví</h2><p>Ví của tài khoản {userId}</p></div>
              <button className="deposit-modal-close" type="button" onClick={() => setShowDepositPanel(false)} aria-label="Đóng">×</button>
            </div>
            <div style={{ background: '#f5f3ff', border: '2px solid #c084fc', padding: '16px', borderRadius: '12px', marginBottom: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#6b21a8' }}>💳 Ví điện tử: <span style={{ color: '#dc2626' }}>{userId}</span></h3>
                  <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: '#7e22ce' }}>Số dư: {walletBalance.toLocaleString()} VNĐ</p>
                </div>
                <button className="btn-secondary" onClick={fetchWalletBalance} type="button">🔄 Cập nhật</button>
              </div>

              <div style={{ background: '#ffffff', padding: '14px 16px', borderRadius: '8px', border: '1px dashed #a855f7' }}>
                <p style={{ margin: '0 0 10px', fontWeight: 'bold' }}>📲 Nạp tiền tự động qua BIDV – QR tự điền mã đơn:</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input aria-label="Số tiền muốn nạp" type="number" min="1" step="1" value={depositAmount} onChange={e=>setDepositAmount(e.target.value)} placeholder="Số tiền muốn nạp" style={{ padding: 10, border: '1px solid #c4b5fd', borderRadius: 8, width: 180 }}/>
                  <button className="btn-primary" type="button" disabled={depositBusy} onClick={createDepositOrder}>{depositBusy ? 'Đang tạo đơn...' : 'Tạo mã nạp tiền'}</button>
                </div>
                {depositMessage && <p role="status" style={{ margin: '10px 0 0', color: '#6b21a8', fontSize: 13 }}>{depositMessage}</p>}
                {depositOrder && (
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setDepositOrder(null);
                        setDepositMessage('Đã quay lại phần nhập số tiền. Lưu ý: đơn cũ vẫn còn hiệu lực đến khi hết hạn; không chuyển khoản theo QR cũ nếu mày tạo đơn mới.');
                      }}
                    >
                      ← Quay lại sửa số tiền
                    </button>
                  </div>
                )}
                {depositOrder && (() => {
                  const remaining = Math.max(0, Math.ceil((new Date(depositOrder.expires_at).getTime() - depositNow) / 1000));
                  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
                  const ss = String(remaining % 60).padStart(2, '0');
                  return <div style={{ display:'flex',gap:18,alignItems:'center',flexWrap:'wrap',marginTop:14 }}>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                      <img src={getDepositQrUrl(depositOrder)} alt="QR nạp tiền" style={{ width: 170, maxWidth:'100%', borderRadius: 8, border:'1px solid #e9d5ff' }}/>
                      <button className="btn-secondary" type="button" onClick={saveDepositQr}>⬇️ Lưu ảnh QR</button>
                    </div>
                    <div style={{fontSize:14,lineHeight:1.7,minWidth:240,flex:'1 1 260px'}}>
                      <p style={{margin:0}}>Số tài khoản / VA: <strong>96247THOLAMTOAN</strong></p>
                      <p style={{margin:0}}>Số tiền phải chuyển: <strong style={{color:'#dc2626',fontSize:19}}>{Number(depositOrder.transfer_amount).toLocaleString('vi-VN')}đ</strong></p>
                      <p style={{margin:0}}>Số tiền cộng vào ví: <strong>{Number(depositOrder.credit_amount).toLocaleString('vi-VN')}đ</strong></p>
                      <p style={{margin:0}}>Mã đơn / nội dung QR: <strong style={{color:'#6b21a8'}}>{depositOrder.order_code}</strong></p>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'5px 0'}}>
                        <button className="btn-secondary" type="button" onClick={copyDepositCode}>📋 Sao chép mã đơn</button>
                      </div>
                      <p style={{margin:0,color: remaining > 0 ? '#92400e' : '#dc2626',fontWeight:700}}>⏳ Còn hiệu lực: {remaining > 0 ? `${mm}:${ss}` : 'Đã hết hạn'}</p>
                      <p style={{margin:'5px 0 0',fontWeight:600}}>Quét QR rồi kiểm tra người nhận, số tiền và nội dung trước khi xác nhận chuyển khoản.</p>
                    </div>
                  </div>;
                })()}
                <p style={{fontSize:12,color:'#6b7280',margin:'10px 0 0'}}>QR thường tự điền số tiền và mã đơn, nhưng tùy ứng dụng ngân hàng có thể không tự nhận nội dung. Nếu ô nội dung trống, hãy bấm “Sao chép mã đơn” rồi dán vào trước khi chuyển. Luôn kiểm tra đúng người nhận và số tiền. Đơn hết hạn sẽ không được tự động ghi nhận.</p>
              </div>
            </div>
          </section>
        </div>
      )}


      {showAdminPanel && isAdmin && (
        <section style={{maxWidth:'1450px',margin:'22px auto',padding:'20px',background:'#fff',border:'1px solid #e9d5ff',borderRadius:'18px',boxShadow:'0 12px 35px rgba(91,33,182,.10)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            <div><h2 style={{margin:'0 0 4px',color:'#6b21a8'}}>⚙️ Trung tâm quản trị Học cùng Thỏ</h2><small style={{color:'#7c6b91'}}>Quản lý hệ thống · thao tác được ghi nhật ký</small></div>
            <button className="btn-secondary" onClick={()=>setShowAdminPanel(false)} type="button">Đóng quản trị ×</button>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'18px 0'}}>
            {[
              ['overview','📊 Tổng quan'],['users','👥 Tài khoản'],['wallet','💳 Ví & giao dịch'],['pricing','🏷️ Giá đề thi'],['examSettings','⏱️ Cấu hình đề'],['catalog','📚 Môn học'],['audit','🧾 Nhật ký'],['roles','🛡️ Phân quyền']
            ].map(([id,label])=><button key={id} type="button" onClick={()=>changeAdminTab(id==='wallet'?'transactions':id)} style={{border:adminTab===(id==='wallet'?'transactions':id)?'2px solid #9333ea':'1px solid #ddd6fe',background:adminTab===(id==='wallet'?'transactions':id)?'#f3e8ff':'#fff',color:'#6b21a8',borderRadius:10,padding:'9px 13px',fontWeight:700,cursor:'pointer'}}>{label}</button>)}
          </div>
          {adminLoading && <p style={{color:'#7e22ce'}}>Đang tải dữ liệu...</p>}
          {adminTab==='overview' && adminDashboard && (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12}}>
                {[
                  ['Tổng tài khoản',adminDashboard.users?.total??0],['Tài khoản mới (30 ngày)',adminDashboard.users?.new_30d??0],
                  ['Đang bị khóa',adminDashboard.users?.suspended??0],['Tổng số dư ví',`${Number(adminDashboard.money?.total_balance||0).toLocaleString('vi-VN')} đ`],
                  ['Lượt mua (30 ngày)',adminDashboard.sales?.purchases??0],['Doanh thu (30 ngày)',`${Number(adminDashboard.sales?.revenue||0).toLocaleString('vi-VN')} đ`]
                ].map(([label,value])=><div key={label} style={{padding:16,borderRadius:13,background:'#faf5ff',border:'1px solid #e9d5ff'}}><small style={{color:'#7c6b91'}}>{label}</small><div style={{fontSize:23,fontWeight:800,color:'#6b21a8',marginTop:5}}>{value}</div></div>)}
              </div>
              <h3 style={{color:'#6b21a8',marginTop:24}}>Doanh thu 14 ngày gần nhất</h3>
              <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th style={{textAlign:'left',padding:10}}>Ngày</th><th style={{textAlign:'right',padding:10}}>Lượt mua</th><th style={{textAlign:'right',padding:10}}>Doanh thu</th></tr></thead><tbody>{(adminDashboard.daily||[]).map(d=><tr key={d.day}><td style={{padding:10,borderTop:'1px solid #eee'}}>{String(d.day).slice(0,10)}</td><td style={{padding:10,textAlign:'right',borderTop:'1px solid #eee'}}>{d.purchases}</td><td style={{padding:10,textAlign:'right',borderTop:'1px solid #eee'}}>{Number(d.revenue).toLocaleString('vi-VN')} đ</td></tr>)}</tbody></table></div>
            </div>
          )}
          {adminTab==='users' && <div>
            <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><input value={adminUserQuery} onChange={e=>setAdminUserQuery(e.target.value)} placeholder="Tìm username hoặc email..." style={{padding:11,border:'1px solid #ddd6fe',borderRadius:9,minWidth:240}}/><button className="btn-primary" onClick={()=>loadAdminTab('users')} type="button">Tìm kiếm</button></div>
            <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:780}}><thead><tr>{['Tài khoản','Email','Số dư','Trạng thái','Thao tác'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#faf5ff'}}>{x}</th>)}</tr></thead><tbody>{adminUsers.map(u=><tr key={u.username}><td style={{padding:10,borderBottom:'1px solid #eee'}}>{u.username}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{u.email}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{Number(u.balance).toLocaleString('vi-VN')} đ</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{u.status==='suspended'?'🔒 Đã khóa':'🟢 Hoạt động'}</td><td style={{padding:10,borderBottom:'1px solid #eee',display:'flex',gap:5,flexWrap:'wrap'}}><button type="button" className="btn-secondary" onClick={()=>adminWalletAction(u.username,'credit')}>+ Tiền</button><button type="button" className="btn-secondary" onClick={()=>adminWalletAction(u.username,'debit')}>− Tiền</button><button type="button" className="btn-secondary" onClick={()=>adminSetUserStatus(u.username,u.status==='suspended'?'active':'suspended')}>{u.status==='suspended'?'Mở khóa':'Khóa'}</button></td></tr>)}</tbody></table></div>
          </div>}
          {adminTab==='transactions' && <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}><thead><tr>{['ID','Tài khoản','Loại','Số tiền','Nội dung','Thời gian'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#faf5ff'}}>{x}</th>)}</tr></thead><tbody>{adminTransactions.map(t=><tr key={t.id}><td style={{padding:9,borderBottom:'1px solid #eee'}}>{t.id}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{t.username}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{t.type}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{Number(t.amount).toLocaleString('vi-VN')} đ</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{t.description}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{new Date(t.created_at).toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div>}
          {adminTab==='pricing' && <form onSubmit={handleSaveExamPrice} style={{maxWidth:520,display:'grid',gap:12,padding:16,background:'#faf5ff',borderRadius:12}}><p>Giá hiện tại: <strong>{examPrice.toLocaleString('vi-VN')} VNĐ</strong></p><label>Giá mới (VNĐ)<input type="number" min="0" max="100000000" step="1" value={adminPriceInput} onChange={e=>setAdminPriceInput(e.target.value)} required style={{display:'block',width:'100%',padding:12,marginTop:6,border:'1px solid #ddd6fe',borderRadius:8}}/></label><button className="btn-primary" type="submit" disabled={adminPriceSaving}>{adminPriceSaving?'Đang lưu...':'💾 Lưu giá mới'}</button></form>}
          {adminTab==='examSettings' && <div>
            <div style={{padding:14,marginBottom:14,background:'#faf5ff',border:'1px solid #e9d5ff',borderRadius:12,color:'#6b21a8'}}>
              <strong>⏱️ Cấu hình riêng cho từng môn học</strong>
              <div style={{fontSize:13,marginTop:5,color:'#7c6b91'}}>Số câu không được vượt quá số câu hỏi hiện có trong kho. Thời gian từ 1 đến 360 phút. Cấu hình chỉ áp dụng cho lượt thi tạo mới.</div>
            </div>
            <div style={{display:'grid',gap:12}}>
              {adminExamSettings.map(subject=><div key={subject.id} style={{display:'grid',gridTemplateColumns:'minmax(180px,2fr) minmax(110px,1fr) minmax(110px,1fr) auto',gap:10,alignItems:'end',padding:14,border:'1px solid #e9d5ff',borderRadius:12,background:'#fff'}}>
                <div><strong style={{color:'#5b21b6'}}>{subject.name}</strong><div style={{fontSize:12,color:'#8b7aa5'}}>{subject.universityName} · Kho có {subject.bankSize} câu</div></div>
                <label style={{fontSize:13,color:'#6b21a8'}}>Số câu<input type="number" min="1" max={subject.bankSize} value={subject.questionCount} onChange={e=>updateAdminExamSetting(subject.id,'questionCount',e.target.value)} style={{display:'block',width:'100%',padding:9,marginTop:5,border:'1px solid #ddd6fe',borderRadius:8}}/></label>
                <label style={{fontSize:13,color:'#6b21a8'}}>Thời gian (phút)<input type="number" min="1" max="360" value={subject.durationMinutes} onChange={e=>updateAdminExamSetting(subject.id,'durationMinutes',e.target.value)} style={{display:'block',width:'100%',padding:9,marginTop:5,border:'1px solid #ddd6fe',borderRadius:8}}/></label>
                <button className="btn-primary" type="button" onClick={()=>saveAdminExamSetting(subject)}>💾 Lưu</button>
              </div>)}
            </div>
          </div>}
          {adminTab==='catalog' && <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}><thead><tr>{['Trường','Môn học','Số câu hỏi','Hiển thị'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#faf5ff'}}>{x}</th>)}</tr></thead><tbody>{adminCatalog.map(c=><tr key={c.id}><td style={{padding:10,borderBottom:'1px solid #eee'}}>{c.universityName}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{c.name}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{c.questionCount}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}><button className="btn-secondary" type="button" onClick={()=>adminToggleSubject(c)}>{c.enabled?'Đang mở · Ẩn môn':'Đang ẩn · Mở môn'}</button></td></tr>)}</tbody></table></div>}
          {adminTab==='audit' && <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:650}}><thead><tr>{['Thời gian','Người thao tác','Hành động','Đối tượng','Chi tiết'].map(x=><th key={x} style={{textAlign:'left',padding:10,background:'#faf5ff'}}>{x}</th>)}</tr></thead><tbody>{adminAudit.map(a=><tr key={a.id}><td style={{padding:9,borderBottom:'1px solid #eee'}}>{new Date(a.created_at).toLocaleString('vi-VN')}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{a.actor}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{a.action}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{a.target}</td><td style={{padding:9,borderBottom:'1px solid #eee'}}>{JSON.stringify(a.details)}</td></tr>)}</tbody></table></div>}
          {adminTab==='roles' && <div>
            <form onSubmit={adminGrantRole} style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}><input value={adminRoleUsername} onChange={e=>setAdminRoleUsername(e.target.value)} placeholder="Username cần cấp quyền" required style={{padding:11,border:'1px solid #ddd6fe',borderRadius:8}}/><select value={adminRoleType} onChange={e=>setAdminRoleType(e.target.value)} style={{padding:11,border:'1px solid #ddd6fe',borderRadius:8}}><option value="support">Hỗ trợ</option><option value="admin">Quản trị viên</option></select><button className="btn-primary" type="submit">Cấp/cập nhật quyền</button></form>
            {adminRoles.map(r=><div key={r.username} style={{display:'flex',justifyContent:'space-between',padding:10,borderBottom:'1px solid #eee'}}><span>{r.username} · {r.role} · cấp bởi {r.granted_by}</span><button className="btn-secondary" type="button" onClick={async()=>{if(!window.confirm(`Thu hồi quyền của ${r.username}?`))return;try{await adminRequest(`roles/${encodeURIComponent(r.username)}`,{method:'DELETE'});void loadAdminTab('roles')}catch(e){setError(e.message)}}}>Thu hồi</button></div>)}
            <small style={{color:'#7c6b91'}}>Super Admin được cấu hình bằng ADMIN_USERNAMES trên Render; chỉ Super Admin được cấp hoặc thu hồi quyền.</small>
          </div>}
        </section>
      )}

      {showAdminPricing && isAdmin && (
        <section style={{ maxWidth: '520px', margin: '20px auto', padding: '22px', background: '#fff', border: '1px solid #ddd6fe', borderRadius: '14px', boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
          <h2 style={{ marginTop: 0, color: '#6b21a8' }}>⚙️ Quản lý giá đề thi</h2>
          <p style={{ color: '#64748b', marginTop: 0 }}>Giá hiện tại: <strong>{examPrice.toLocaleString('vi-VN')} VNĐ</strong></p>
          <form onSubmit={handleSaveExamPrice} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label htmlFor="admin-exam-price" style={{ fontWeight: 600 }}>Giá mới (VNĐ)</label>
            <input id="admin-exam-price" type="number" min="0" max="100000000" step="1" value={adminPriceInput} onChange={e => setAdminPriceInput(e.target.value)} required style={{ padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '16px' }} />
            <small style={{ color: '#64748b' }}>Nhập số nguyên từ 0 đến 100.000.000 đồng. Giá 0đ sẽ miễn phí đề thi. Giá được lưu trong Neon và áp dụng cho các lượt mua mới.</small>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-primary" type="submit" disabled={adminPriceSaving}>{adminPriceSaving ? 'Đang lưu...' : '💾 Lưu giá mới'}</button>
              <button className="btn-secondary" type="button" onClick={() => setShowAdminPricing(false)}>Đóng</button>
            </div>
          </form>
        </section>
      )}

      {error && (
        <div className="notification error" role="alert">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError('')}>×</button>
        </div>
      )}

      {successMessage && (
        <div style={{ background: '#dcfce7', color: '#15803d', padding: '12px 16px', borderRadius: '8px', margin: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {successMessage}</span>
          <button type="button" onClick={() => setSuccessMessage('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>×</button>
        </div>
      )}

      {purchaseSubject && (
        <div className="exam-warning-backdrop" role="dialog" aria-modal="true" aria-labelledby="purchase-confirm-title">
          <div className="exam-warning-modal purchase-confirm-modal">
            <div className="exam-warning-icon">🛒</div>
            <h2 id="purchase-confirm-title">Xác nhận mua đề thi</h2>
            <p>Bạn đang chuẩn bị mua quyền làm đề <strong>{selectedExamTerm === 'midterm' ? 'Giữa kỳ' : 'Cuối kỳ'} – {purchaseSubject.name}</strong>.</p>
            <div className="purchase-confirm-breakdown">
              <div><span>Giá đề thi</span><strong>{examPrice.toLocaleString('vi-VN')} VNĐ</strong></div>
              <div><span>Số dư hiện tại</span><strong>{walletBalance.toLocaleString('vi-VN')} VNĐ</strong></div>
              <div className="purchase-confirm-after"><span>Số dư sau khi mua</span><strong>{Math.max(0, walletBalance - examPrice).toLocaleString('vi-VN')} VNĐ</strong></div>
            </div>
            <p className="purchase-confirm-note">Tiền chỉ bị trừ khi bạn tiếp tục xác nhận và bắt đầu bài thi ở bước tiếp theo. Nếu chọn Hủy, tài khoản không bị trừ tiền.</p>
            {walletBalance < examPrice && <p className="purchase-insufficient">Số dư không đủ. Vui lòng nạp thêm tiền trước khi mua đề.</p>}
            <div className="exam-warning-actions">
              <button className="btn-secondary" type="button" onClick={() => setPurchaseSubject(null)}>Hủy</button>
              <button className="btn-primary exam-warning-confirm" type="button" disabled={walletBalance < examPrice} onClick={confirmPurchasePrompt}>Xác nhận giá và tiếp tục</button>
            </div>
          </div>
        </div>
      )}

      {preExamSubject && (
        <div className="exam-warning-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="pre-exam-warning-title">
          <div className="exam-warning-modal">
            <div className="exam-warning-icon">📋</div>
            <h2 id="pre-exam-warning-title">Lưu ý trước khi vào thi</h2>
            <p>Bài thi sẽ chạy ở chế độ toàn màn hình. Nếu thoát toàn màn hình, chuyển tab hoặc rời cửa sổ thi, hệ thống sẽ ghi nhận vi phạm.</p>
            <p><strong>Đủ 3 lần vi phạm, bài thi sẽ bị hủy.</strong> Khi có cảnh báo, hãy quay lại toàn màn hình bằng nút tiếp tục.</p>
            <div className="exam-warning-actions">
              <button className="btn-secondary" type="button" onClick={() => setPreExamSubject(null)}>Hủy</button>
              <button className="btn-primary exam-warning-confirm" type="button" onClick={() => void confirmStartExam()}>Đồng ý, vào làm bài</button>
            </div>
          </div>
        </div>
      )}

      {violationNotice && (
        <div className="exam-warning-backdrop" role="alertdialog" aria-modal="true">
          <div className="exam-warning-modal">
            <div className="exam-warning-icon">⚠️</div>
            <h2>Cảnh báo quy chế thi</h2>
            <p>{violationNotice}</p>
            {step === 'doing-exam' && !isSubmitted ? (
              <div className="exam-warning-actions">
                <button className="btn-secondary" type="button" onClick={stopExamNow}>Dừng làm bài</button>
                <button className="btn-primary exam-warning-confirm" type="button" onClick={() => void resumeExamFullscreen()}>Quay lại toàn màn hình và tiếp tục</button>
              </div>
            ) : (
              <div className="exam-warning-actions">
                <button className="btn-primary" type="button" onClick={closeCancelledExamNotice}>Về danh sách môn học</button>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            <span className="spinner-icon">🐰</span>
            <p>Thỏ đang xử lý, chờ một chút nhé...</p>
          </div>
        </div>
      )}

      <main className="app-main">
        {!authReady ? (
          <section className="fade-in" style={{ minHeight: '55vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
            <div style={{ fontSize: '42px' }}>🐰</div>
            <p>Thỏ đang kiểm tra phiên đăng nhập...</p>
          </section>
        ) : step === 'auth' && (
          <section className="fade-in" style={{ maxWidth: '420px', margin: '40px auto', background: '#fff', padding: '30px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <h2 style={{ color: '#7c3aed', marginBottom: '8px' }}>
              {authMode === 'login' && '🔑 Đăng nhập'}
              {authMode === 'register' && '📝 Đăng Ký tài Khoản'}
              {authMode === 'verify-otp' && '✉️ Mã xác thực OTP'}
              {authMode === 'forgot' && '🔄 Khôi phục mật khẩu'}
              {authMode === 'reset-otp' && '🔒 Đặt lại mật khẩu'}
            </h2>

            {/* 1. Đăng nhập */}
            {authMode === 'login' && (
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                <input 
                  type="text" 
                  placeholder="Tên tài khoản hoặc email đăng ký" 
                  value={loginKeyInput}
                  onChange={(e) => setLoginKeyInput(e.target.value)}
                  style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }}
                />
                <input 
                  type="password" 
                  placeholder="Mật khẩu" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }}
                />
                <button type="submit" className="btn-primary" style={{ padding: '12px', fontSize: '16px' }}>🚀 Đăng nhập</button>
              </form>
            )}

            {/* 2. Đăng ký: OTP nằm ngay dưới xác nhận mật khẩu */}
            {authMode === 'register' && (
              <form onSubmit={handleVerifyRegisterOtp} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                <input type="text" minLength={6} maxLength={30} placeholder="Nhập tên tài khoản" value={usernameInput}
                  onChange={(e) => { setUsernameInput(e.target.value); setUsernameAvailability({ status: 'idle', message: '' }); }}
                  onBlur={() => checkRegistrationField('username', usernameInput)}
                  style={{ padding: '12px 16px', borderRadius: '8px', border: usernameAvailability.status === 'taken' ? '1px solid #dc2626' : '1px solid #d1d5db', fontSize: '15px' }} />
                <small style={{ color: '#64748b', textAlign: 'left', marginTop: '-10px' }}>Tên tài khoản từ 6–30 ký tự; dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.</small>
                {usernameAvailability.message && <small role="status" style={{ color: usernameAvailability.status === 'available' ? '#15803d' : usernameAvailability.status === 'checking' ? '#64748b' : '#dc2626', marginTop: '-10px' }}>{usernameAvailability.message}</small>}
                <input type="email" placeholder="Nhập email" value={emailOrPhoneInput}
                  onChange={(e) => { setEmailOrPhoneInput(e.target.value); setEmailAvailability({ status: 'idle', message: '' }); }}
                  onBlur={() => checkRegistrationField('email', emailOrPhoneInput)}
                  style={{ padding: '12px 16px', borderRadius: '8px', border: emailAvailability.status === 'taken' ? '1px solid #dc2626' : '1px solid #d1d5db', fontSize: '15px' }} />
                {emailAvailability.message && <small role="status" style={{ color: emailAvailability.status === 'available' ? '#15803d' : emailAvailability.status === 'checking' ? '#64748b' : '#dc2626', marginTop: '-10px' }}>{emailAvailability.message}</small>}
                <input type="password" minLength={6} maxLength={128} placeholder="Nhập mật khẩu" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} />
                <small style={{ color: '#64748b', textAlign: 'left', marginTop: '-10px' }}>Mật khẩu từ 6–128 ký tự, bắt buộc có chữ thường, chữ hoa, chữ số và ký tự đặc biệt.</small>
                <input type="password" placeholder="Nhập lại mật khẩu" value={confirmPasswordInput} onChange={(e) => setConfirmPasswordInput(e.target.value)} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} />
                <div className="otp-input-row">
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="Nhập mã OTP 6 chữ số" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  <button type="button" className="otp-send-button" disabled={isLoading || otpCooldown > 0} onClick={handleRequestRegisterOtp}>{otpCooldown > 0 ? `Gửi lại (${otpCooldown}s)` : '📨 Gửi OTP'}</button>
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '12px', fontSize: '16px' }}>✨ Xác nhận & Đăng ký</button>
              </form>
            )}

            {/* 3. Quên mật khẩu: gửi OTP, nhập OTP và mật khẩu mới cùng màn hình */}
            {authMode === 'forgot' && (
              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
                <input type="email" placeholder="Nhập email đã đăng ký" value={emailOrPhoneInput} onChange={(e) => setEmailOrPhoneInput(e.target.value)} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} />
                <div className="otp-input-row">
                  <input type="text" inputMode="numeric" maxLength={6} placeholder="Nhập mã OTP 6 chữ số" value={otpInput} onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                  <button type="button" className="otp-send-button" disabled={isLoading || otpCooldown > 0} onClick={handleRequestForgotOtp}>{otpCooldown > 0 ? `Gửi lại (${otpCooldown}s)` : '📨 Gửi OTP'}</button>
                </div>
                <input type="password" minLength={6} maxLength={128} placeholder="Nhập mật khẩu mới" value={newPasswordInput} onChange={(e) => setNewPasswordInput(e.target.value)} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} />
                <input type="password" placeholder="Nhập lại mật khẩu mới" value={confirmNewPasswordInput} onChange={(e) => setConfirmNewPasswordInput(e.target.value)} style={{ padding: '12px 16px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '15px' }} />
                <button type="submit" className="btn-primary" style={{ padding: '12px', fontSize: '16px' }}>🔒 Xác nhận & Đổi mật khẩu</button>
              </form>
            )}

            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #f3f4f6', fontSize: '14px', color: '#4b5563', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {authMode === 'login' && (
                <>
                  <p>Chưa có tài khoản? <span onClick={() => { setAuthMode('register'); setError(''); setUsernameAvailability({ status: 'idle', message: '' }); setEmailAvailability({ status: 'idle', message: '' }); }} style={{ color: '#7c3aed', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Đăng ký ngay</span></p>
                  <p><span onClick={() => { setAuthMode('forgot'); setError(''); }} style={{ color: '#dc2626', cursor: 'pointer', textDecoration: 'underline' }}>Quên mật khẩu?</span></p>
                </>
              )}
              {authMode !== 'login' && (
                <p>Đã có tài khoản? <span onClick={() => { setAuthMode('login'); setError(''); }} style={{ color: '#7c3aed', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>Quay lại đăng nhập</span></p>
              )}
            </div>
          </section>
        )}

        {step === 'select-uni' && (
          <section className="fade-in">
            <div className="hero-banner">
              <h2>Xin chào {userId}! Chinh phục kỳ thi cùng Thỏ 🚀</h2>
              <p>Chọn trường đại học mục tiêu của bạn để bắt đầu luyện đề:</p>
            </div>
            <div className="university-grid">
              {universities.map((uni) => (
                <button className="university-card" key={uni.id} type="button" onClick={() => handleSelectUni(uni)}>
                  <span className="uni-icon">🏫</span>
                  <span className="uni-name">{uni.name}</span>
                  <span className="uni-arrow">→</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {step === 'select-subject' && (
          <section className="fade-in">
            <div className="section-header-nav">
              <button className="back-link" type="button" onClick={() => setStep('select-uni')}>← Chọn trường khác</button>
              <h2>{selectedUni?.name}</h2>
            </div>

            <div className="subject-grid">
              {subjects.map((subject) => (
                <div className="subject-card" key={subject.id}>
                  <div className="subject-info">
                    <span className="subject-icon">📖</span>
                    <div>
                      <h3>{subject.name}</h3>
                      <p>Giá: <strong>{examPrice.toLocaleString('vi-VN')} VNĐ</strong></p>
                    </div>
                  </div>
                  <button className="btn-primary" type="button" onClick={() => { setTermSubject(subject); setStep('select-term'); }}>📁 Chọn kỳ thi</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {step === 'select-term' && termSubject && (
          <section className="fade-in">
            <div className="section-header-nav">
              <button className="back-link" type="button" onClick={() => setStep('select-subject')}>← Quay lại danh sách môn</button>
              <h2>{termSubject.name}</h2>
            </div>
            <p className="term-folder-intro">Chọn thư mục đề thi bạn muốn làm.</p>
            <div className="term-folder-grid">
              <button className="term-folder-card" type="button" disabled={termSubject.id !== 'toancc1_iuh'} onClick={() => { setSelectedExamTerm('midterm'); handleBuyAndStartExam(termSubject); }}>
                <span className="term-folder-icon">📁</span>
                <strong>Giữa kỳ</strong>
                <small>{termSubject.id === 'toancc1_iuh' ? '20 câu hỏi · Đã có đề' : 'Chưa có đề thi'}</small>
              </button>
              <button className="term-folder-card" type="button" disabled>
                <span className="term-folder-icon">📁</span>
                <strong>Cuối kỳ</strong>
                <small>Chưa có đề thi</small>
              </button>
            </div>
          </section>
        )}

        {step === 'doing-exam' && examData && (
          <div className="exam-layout fade-in">
            <div className="exam-sticky-bar">
              <div className="exam-title-group">
                <h2>{examData.title}</h2>
                <span className="badge-count">Đã làm: <strong>{Object.keys(userAnswers).length}</strong> / {examData.questions.length}</span>
              </div>
              <div className={`timer-badge ${timeLeft < 60 ? 'danger' : ''}`}>⏱️ {formatTime(timeLeft)}</div>
            </div>

            <div className="questions-container">
              {examData.questions.map((q, idx) => {
                const detail = isSubmitted ? result?.details?.find(item => String(item.questionId) === String(q.id)) : null;
                return (
                  <article id={`question-card-${idx}`} style={{ scrollMarginTop: '110px' }} className={`question-card ${detail ? (detail.isCorrect ? 'correct-card' : 'wrong-card') : ''}`} key={q.id ?? idx}>
                    <div className="question-header"><span className="q-index">Câu {idx + 1}</span></div>
                    <div className="question-text"><MathContent value={q.content} inline={true} /></div>
                    <div className="options-grid">
                      {Object.entries(q.options || {}).map(([key, val]) => {
                        const isSelected = userAnswers[q.id] === key;
                        let cls = 'option-item';
                        if (isSelected) cls += ' selected';
                        if (isSubmitted) {
                          if (detail?.correctAnswer === key) cls += ' correct';
                          if (isSelected && !detail?.isCorrect) cls += ' incorrect';
                        }
                        return (
                          <label className={cls} key={key}>
                            <input type="radio" name={`q-${q.id}`} checked={isSelected} disabled={isSubmitted} onChange={() => handleSelectOption(q.id, key)} />
                            <span className="option-badge">{key}.</span>
                            <span className="option-text-content"><MathContent value={val} inline={true} /></span>
                          </label>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="exam-footer-action">
              {!isSubmitted ? (
                <button className="btn-submit" type="button" onClick={() => void handleSubmit()}>🚀 Nộp bài thi</button>
              ) : (
                <div className="result-summary-card">
                  <div className="result-header-badge">🎉 Kết quả bài thi</div>
                  <div className="score-big">{result?.score ?? 0} <span className="score-total">/ {result?.totalQuestions}</span></div>
                  <button className="btn-primary" type="button" onClick={() => currentSubject && handleBuyAndStartExam(currentSubject)}>🔄 Làm đề thi khác</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer"><p>Học cùng Thỏ · Kiên trì mỗi ngày 🐰</p></footer>
    </div>
  );
}
