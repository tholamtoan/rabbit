import { useState, useEffect, useRef, useCallback } from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import './App.css';

const API_BASE = 'https://rabbit-backend-68j4.onrender.com/api';

function MathContent({ value = '', inline = false }) {
  const source = String(value ?? '').replace(/\r\n/g, '\n');

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

  const tokenRegex = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
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

// Xác nhận quyền Admin bằng endpoint được backend bảo vệ, không chỉ tin cờ
// isAdmin từ phản hồi đăng nhập/khôi phục phiên.
async function verifyAdminPermission(token, fallback = false) {
  if (!token) return false;
  try {
    await fetchJson(`${API_BASE}/admin/pricing`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return true;
  } catch (error) {
    if (error.status === 403 || error.status === 401) return false;
    // Giữ tương thích nếu backend đang deploy dở hoặc endpoint chưa cập nhật.
    return Boolean(fallback);
  }
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
  const [examPrice, setExamPrice] = useState(1000);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPricing, setShowAdminPricing] = useState(false);
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
      const adminStatus = await verifyAdminPermission(data.token, data.isAdmin);
      setUserId(data.userId);
      setWalletBalance(data.balance || 0);
      setIsAdmin(adminStatus);
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
      const adminStatus = await verifyAdminPermission(data.token, data.isAdmin);
      setUserId(data.userId);
      setWalletBalance(data.balance || 0);
      setIsAdmin(adminStatus);
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
      .then(async (data) => {
        if (cancelled) return;
        const adminStatus = await verifyAdminPermission(token, data.isAdmin);
        if (cancelled) return;
        setUserId(data.userId);
        setWalletBalance(Number(data.balance) || 0);
        setIsAdmin(adminStatus);
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

  const handleBuyAndStartExam = async (subject) => {
    if (walletBalance < examPrice) {
      alert(`Số dư không đủ! Bạn hiện có ${walletBalance.toLocaleString()}đ.`);
      return;
    }
    if (!window.confirm(`Xác nhận dùng ${examPrice.toLocaleString('vi-VN')}đ mở khóa bài thi môn "${subject.name}"?`)) return;

    setIsLoading(true);
    try {
      const buyRes = await fetchJson(`${API_BASE}/exam/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('hct_session_token') || ''}` },
        body: JSON.stringify({ subjectId: subject.id })
      });
      if (buyRes.success) {
        setWalletBalance(buyRes.newBalance);
        await handleStartRandomExam(subject);
      }
    } catch (err) {
      setError(`Không mua được đề: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartRandomExam = async (subject) => {
    setCurrentSubject(subject);
    setError('');
    setIsLoading(true);
    setViolationNotice('');
    setIncompleteSubmitNotice('');
    setTabViolationCount(0);
    tabViolationCountRef.current = 0;
    lastViolationAtRef.current = 0;
    submitLock.current = false;

    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    try {
      const data = await fetchJson(`${API_BASE}/exam/random/${subject.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('hct_session_token') || ''}` } });
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
      const nextCount = tabViolationCountRef.current + 1;
      tabViolationCountRef.current = nextCount;
      setTabViolationCount(nextCount);

      if (nextCount >= MAX_TAB_VIOLATIONS) {
        submitLock.current = true;
        setViolationNotice(`Bài thi bị hủy do vi phạm quy chế thi ${MAX_TAB_VIOLATIONS} lần.`);
        setStep('select-subject');
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        return;
      }
      setViolationNotice(`Cảnh báo vi phạm (${nextCount}/${MAX_TAB_VIOLATIONS}): Bạn vừa ${reason}.`);
    };

    const handleVis = () => { if (document.visibilityState === 'hidden') registerViolation('rời khỏi tab thi'); };
    const handleBlur = () => registerViolation('rời khỏi cửa sổ thi');
    const handleFull = () => { if (!document.fullscreenElement) registerViolation('thoát toàn màn hình'); };

    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFull);
    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFull);
    };
  }, [step, isSubmitted]);

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
              {isAdmin && <button className="home-btn" onClick={() => { setAdminPriceInput(String(examPrice)); setShowAdminPricing(v => !v); }} type="button">⚙️ Quản lý giá</button>}
              <button className="home-btn" onClick={handleReset} type="button">🏠 Trang chủ</button>
              <button className="home-btn" onClick={handleLogout} type="button" style={{ background: '#fee2e2', color: '#dc2626' }}>🚪 Đăng xuất ({userId})</button>
            </div>
          )}
        </div>
      </header>

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

      {violationNotice && (
        <div className="exam-warning-backdrop" role="alertdialog">
          <div className="exam-warning-modal">
            <div className="exam-warning-icon">⚠️</div>
            <h2>Cảnh báo quy chế thi</h2>
            <p>{violationNotice}</p>
            <button className="btn-primary exam-warning-confirm" type="button" onClick={() => setViolationNotice('')}>Đã hiểu</button>
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

            <div style={{ background: '#f5f3ff', border: '2px solid #c084fc', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#6b21a8' }}>💳 Ví điện tử: <span style={{ color: '#dc2626' }}>{userId}</span></h3>
                  <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: '#7e22ce' }}>Số dư: {walletBalance.toLocaleString()} VNĐ</p>
                </div>
                <button className="btn-secondary" onClick={fetchWalletBalance} type="button">🔄 Cập nhật</button>
              </div>

              <div style={{ background: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px dashed #a855f7' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 'bold' }}>📲 Quét QR nạp tiền qua BIDV:</p>
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={`https://qr.sepay.vn/img?bank=BIDV&acc=96247THOLAMTOAN&des=NAP%20${userId}`} alt="QR" style={{ width: '130px', borderRadius: '8px' }}/>
                  <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                    <p style={{ margin: 0 }}>• Số TK / VA: <strong>96247THOLAMTOAN</strong></p>
                    <p style={{ margin: 0 }}>• Cú pháp: <strong style={{ color: '#dc2626', background: '#fee2e2', padding: '2px 6px' }}>NAP {userId}</strong></p>
                  </div>
                </div>
              </div>
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
                  <button className="btn-primary" type="button" onClick={() => handleBuyAndStartExam(subject)}>🛒 Mua đề⚡</button>
                </div>
              ))}
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