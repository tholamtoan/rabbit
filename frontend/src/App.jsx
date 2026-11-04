import { useState, useEffect, useRef, useCallback } from 'react';

import { InlineMath, BlockMath } from 'react-katex';

import 'katex/dist/katex.min.css';

import './App.css';



const API_BASE = 'https://rabbit-backend-68j4.onrender.com/api';



function MathContent({ value = '', inline = false }) {
  const source = String(value ?? '').replace(/\r\n/g, '\n');

  // Các đáp án trong ngân hàng có thể ghi số khoa học ở dạng văn bản
  // như 3,98×10-6 hoặc 10-4. Chỉ chuyển đổi ở phần văn bản thuần,
  // tuyệt đối không sửa nội dung bên trong các cặp dấu LaTeX có sẵn.
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

  // Bắt trọn cặp dấu công thức trước khi xét nội dung bên trong.
  // Nhờ vậy \begin{align} nằm trong \[...\] không bị tách khỏi dấu ngoặc.
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

    // InlineMath mặc định dùng textstyle khiến phân số dài và tích phân
    // trông quá sít. Dùng displaystyle cho các cấu trúc cao để tử/mẫu,
    // căn thức và cận tích phân có khoảng cách đúng, không sửa LaTeX gốc.
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
          {/* Tai thỏ mềm, hơi nghiêng tự nhiên */}
          <path d="M31 43 C23 25 23 5 34 5 C45 5 47 24 47 40" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M55 40 C54 22 59 5 70 7 C82 9 77 29 68 45" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M33 32 C29 19 30 12 34 12 C39 12 40 24 41 34" fill="#f5a9d2" />
          <path d="M61 34 C63 21 67 13 71 14 C76 16 70 29 66 37" fill="#f5a9d2" />
          {/* Khuôn mặt */}
          <path d="M18 58 C18 39 32 29 50 29 C69 29 83 41 83 59 C83 79 69 92 50 92 C31 92 18 78 18 58Z" fill="#fff" stroke="#8f55c7" strokeWidth="4.5" />
          {/* Má hồng */}
          <ellipse cx="33" cy="66" rx="8" ry="5" fill="#f7bfdc" />
          <ellipse cx="67" cy="66" rx="8" ry="5" fill="#f7bfdc" />
          {/* Mắt và mũi */}
          <ellipse cx="39" cy="57" rx="3.2" ry="4.4" fill="#49345d" />
          <ellipse cx="61" cy="57" rx="3.2" ry="4.4" fill="#49345d" />
          <path d="M46 65 Q50 61 54 65 Q50 71 46 65Z" fill="#e88ab8" />
          <path d="M50 70 Q46 76 41 72 M50 70 Q54 76 59 72" fill="none" stroke="#745080" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M27 61 L21 59 M73 61 L79 59" stroke="#d99ac4" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <div className="logo-texts">
        <h1>Học cùng Thỏ</h1>
        <span>Ôn thi đại học thông minh</span>
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

    throw new Error(data?.message || `Lỗi máy chủ (${response.status}).`);

  }

  return data;

}



export default function App() {

  const [step, setStep] = useState('select-uni');

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

  const [error, setError] = useState('');
  const [tabViolationCount, setTabViolationCount] = useState(0);
  const [violationNotice, setViolationNotice] = useState('');
  const [incompleteSubmitNotice, setIncompleteSubmitNotice] = useState('');



  const answersRef = useRef({});

  const examRef = useRef(null);

  const submitLock = useRef(false);
  const tabViolationCountRef = useRef(0);
  const lastViolationAtRef = useRef(0);
  const MAX_TAB_VIOLATIONS = 3;



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

    } catch (err) {

      setError(`Không tải được danh sách môn: ${err.message}`);

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

    // Yêu cầu toàn màn hình ngay trong thao tác bấm bắt đầu thi để trình duyệt
    // nhận diện đây là hành động trực tiếp của người dùng.
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
          setViolationNotice('Trình duyệt chưa cho phép chế độ toàn màn hình. Hãy bật toàn màn hình để làm bài thi tập trung.');
        });
      } else {
        setViolationNotice('Trình duyệt này không hỗ trợ chế độ toàn màn hình.');
      }
    }

    try {

      const data = await fetchJson(`${API_BASE}/exam/random/${subject.id}`);

      if (data?.message && !Array.isArray(data.questions)) {

        setError(data.message);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }

        return;

      }

      if (!Array.isArray(data.questions)) {

        throw new Error('Dữ liệu đề thi không có danh sách câu hỏi.');

      }

      setExamData(data);

      examRef.current = data;

      setTimeLeft(Math.max(0, Number(data.durationMinutes) || 0) * 60);

      setUserAnswers({});

      answersRef.current = {};

      setResult(null);

      setIsSubmitted(false);

      submitLock.current = false;

      setStep('doing-exam');

    } catch (err) {

      setError(`Không tạo được đề thi: ${err.message}`);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

    } finally {

      setIsLoading(false);

    }

  };



  const handleSubmit = useCallback(async (answersOverride, { allowIncomplete = false } = {}) => {

    const currentExam = examRef.current;

    if (submitLock.current || !currentExam) return;

    const answersToSubmit = answersOverride ?? answersRef.current;
    const firstUnansweredIndex = currentExam.questions.findIndex(
      (question) => !answersToSubmit[question.id]
    );

    if (firstUnansweredIndex !== -1 && !allowIncomplete) {
      const unansweredCount = currentExam.questions.filter(
        (question) => !answersToSubmit[question.id]
      ).length;

      // Không dùng window.alert() trong chế độ toàn màn hình: hộp thoại native
      // có thể khiến trình duyệt tự thoát fullscreen và bị tính nhầm là vi phạm.
      // Dùng modal React bên trong trang để giữ nguyên trạng thái fullscreen.
      setIncompleteSubmitNotice(
        `Bạn chưa hoàn thành bài thi! Còn ${unansweredCount} câu chưa trả lời. Hệ thống đã đưa bạn đến câu chưa hoàn thành đầu tiên.`
      );

      const firstUnansweredCard = document.getElementById(
        `question-card-${firstUnansweredIndex}`
      );
      firstUnansweredCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    submitLock.current = true;

    setError('');

    setIsLoading(true);



    try {

      const data = await fetchJson(`${API_BASE}/exam/submit-random`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          userAnswers: answersToSubmit,

          secretKey: currentExam._secretKey,

          secretExplanation: currentExam._secretExplanation,

        }),

      });

      setResult(data);
      setIncompleteSubmitNotice('');

      setIsSubmitted(true);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }

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
      // Một lần rời trang có thể phát đồng thời blur, visibilitychange và
      // fullscreenchange. Gộp các sự kiện gần nhau thành một vi phạm.
      if (submitLock.current || tabViolationCountRef.current >= MAX_TAB_VIOLATIONS) return;
      const now = Date.now();
      if (now - lastViolationAtRef.current < 800) return;
      lastViolationAtRef.current = now;

      const nextCount = tabViolationCountRef.current + 1;
      tabViolationCountRef.current = nextCount;
      setTabViolationCount(nextCount);

      if (nextCount >= MAX_TAB_VIOLATIONS) {
        submitLock.current = true;
        setViolationNotice(`Bài thi đã bị hủy vì bạn vi phạm quy định chuyển tab/toàn màn hình ${MAX_TAB_VIOLATIONS} lần. Bạn có thể bắt đầu một đề mới.`);
        setIncompleteSubmitNotice('');
        setStep('select-subject');
        setExamData(null);
        examRef.current = null;
        setTimeLeft(0);
        setUserAnswers({});
        answersRef.current = {};
        setResult(null);
        setIsSubmitted(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      setViolationNotice(`Cảnh báo ${nextCount}/${MAX_TAB_VIOLATIONS}: Hệ thống phát hiện bạn ${reason}. Nếu vi phạm đủ ${MAX_TAB_VIOLATIONS} lần, bài thi sẽ tự động bị hủy.`);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        registerViolation('chuyển sang tab khác hoặc rời khỏi trang thi');
      }
    };
    const handleWindowBlur = () => registerViolation('rời khỏi cửa sổ thi');
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) registerViolation('thoát chế độ toàn màn hình');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [step, isSubmitted]);


  useEffect(() => {

    if (step !== 'doing-exam' || timeLeft <= 0 || isSubmitted || !examData) return undefined;



    const timer = window.setInterval(() => {

      setTimeLeft((previous) => {

        if (previous <= 1) {

          window.clearInterval(timer);

          void handleSubmit(undefined, { allowIncomplete: true });

          return 0;

        }

        return previous - 1;

      });

    }, 1000);



    return () => window.clearInterval(timer);

  }, [step, timeLeft, isSubmitted, examData, handleSubmit]);



  const handleSelectOption = (questionId, optionKey) => {

    if (isSubmitted) return;

    setUserAnswers((previous) => {

      const next = { ...previous, [questionId]: optionKey };

      answersRef.current = next;

      return next;

    });

  };



  const formatTime = (seconds) => {

    const safeSeconds = Math.max(0, Number(seconds) || 0);

    const minutes = Math.floor(safeSeconds / 60);

    const remainingSeconds = safeSeconds % 60;

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;

  };



  const handleReset = () => {

    submitLock.current = true;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setViolationNotice('');
    setTabViolationCount(0);
    tabViolationCountRef.current = 0;
    setStep('select-uni');

    setSelectedUni(null);

    setSubjects([]);

    setCurrentSubject(null);
    setExamData(null);

    examRef.current = null;

    answersRef.current = {};

    setUserAnswers({});

    setTimeLeft(0);

    setResult(null);

    setIsSubmitted(false);

    setIsLoading(false);

    setError('');

    submitLock.current = true;

  };

  const unansweredCount = examData
    ? examData.questions.length - Object.keys(userAnswers).length
    : 0;

  const handleDismissViolationNotice = () => {
    setViolationNotice('');
    // Sau cảnh báo, yêu cầu người dùng bật lại fullscreen bằng chính thao tác
    // bấm nút của họ nếu trình duyệt đã thoát chế độ toàn màn hình.
    if (step === 'doing-exam' && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        setViolationNotice('Chưa thể bật lại toàn màn hình. Hãy sử dụng trình duyệt hỗ trợ Fullscreen API để tiếp tục làm bài.');
      });
    }
  };

  return (

        <div className="app-container">


      <header className="app-header">

        <div className="header-content">

          <RabbitLogo />

          {step !== 'select-uni' && (

            <button className="home-btn" onClick={handleReset} type="button">🏠 Trang chủ</button>

          )}

        </div>

      </header>



      {error && (

        <div className="notification error" role="alert">

          <span>⚠️ {error}</span>

          <button type="button" onClick={() => setError('')}>×</button>

        </div>

      )}



      {violationNotice && (
        <div className="exam-warning-backdrop" role="alertdialog" aria-modal="true" aria-live="assertive">
          <div className="exam-warning-modal">
            <div className="exam-warning-icon">⚠️</div>
            <h2>{tabViolationCount >= MAX_TAB_VIOLATIONS ? 'Bài thi đã bị hủy' : 'Cảnh báo vi phạm quy chế thi'}</h2>
            <p>{violationNotice}</p>
            {step === 'doing-exam' && (
              <p className="exam-warning-count">Số lần vi phạm: <strong>{tabViolationCount}/{MAX_TAB_VIOLATIONS}</strong></p>
            )}
            <button className="btn-primary exam-warning-confirm" type="button" onClick={handleDismissViolationNotice}>Đã hiểu</button>
          </div>
        </div>
      )}


      {incompleteSubmitNotice && step === 'doing-exam' && (
        <div className="exam-warning-backdrop" role="alertdialog" aria-modal="true" aria-live="assertive">
          <div className="exam-warning-modal">
            <div className="exam-warning-icon">📝</div>
            <h2>Chưa hoàn thành bài thi</h2>
            <p>{incompleteSubmitNotice}</p>
            <button
              className="btn-primary exam-warning-confirm"
              type="button"
              onClick={() => setIncompleteSubmitNotice('')}
            >
              Tiếp tục làm bài
            </button>
          </div>
        </div>
      )}

      {isLoading && (

        <div className="loading-overlay">

          <div className="loading-spinner">

            <span className="spinner-icon">🐰</span>

            <p>Thỏ đang chuẩn bị dữ liệu, chờ một chút nhé...</p>

          </div>

        </div>

      )}



      <main className="app-main">

        {step === 'select-uni' && (

          <section className="fade-in">

            <div className="hero-banner">

              <h2>Chinh phục kỳ thi cùng Thỏ 🚀</h2>

              <p>Chọn trường đại học mục tiêu của bạn để bắt đầu luyện đề thi thử bám sát cấu trúc:</p>

            </div>

            <div className="university-grid">

              {universities.map((uni) => (

                <button

                  className="university-card"

                  key={uni.id}

                  type="button"

                  disabled={isLoading}

                  onClick={() => handleSelectUni(uni)}

                >

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

            <p className="section-desc">Chọn môn học bạn muốn luyện tập bên dưới:</p>

            <div className="subject-grid">

              {subjects.map((subject) => (

                <div className="subject-card" key={subject.id}>

                  <div className="subject-info">

                    <span className="subject-icon">📖</span>

                    <div>

                      <h3>{subject.name}</h3>

                      <p>Đề trắc nghiệm ngẫu nhiên từ ngân hàng</p>

                    </div>

                  </div>

                  <button

                    className="btn-primary"

                    type="button"

                    disabled={isLoading}

                    onClick={() => handleStartRandomExam(subject)}

                  >

                    Vào thi ngay ⚡

                  </button>

                </div>

              ))}

            </div>

          </section>

        )}



        {step === 'doing-exam' && examData && (

          <div className="exam-layout fade-in">

            <div className="exam-sticky-bar">

              <div className="exam-title-group">

                <h2>{examData.title || 'Đề thi trắc nghiệm'}</h2>

                <span className="badge-count">

                  Đã làm: <strong>{Object.keys(userAnswers).length}</strong> / {examData.questions.length} câu

                </span>

              </div>

              <div className={`timer-badge ${timeLeft < 60 ? 'danger' : ''}`}>

                ⏱️ {formatTime(timeLeft)}

              </div>

            </div>



            <div className="questions-container">

              {examData.questions.map((q, idx) => {

                const detail = isSubmitted

                  ? result?.details?.find((item) => String(item.questionId) === String(q.id))

                  : null;



                return (

                  <article id={`question-card-${idx}`} style={{ scrollMarginTop: '110px' }} className={`question-card ${detail ? (detail.isCorrect ? 'correct-card' : 'wrong-card') : ''}`} key={q.id ?? idx}>

                    <div className="question-header">

                      <span className="q-index">Câu {idx + 1}</span>

                    </div>

                    {/* Dùng inline cho phép hiển thị nối liền trên 1 dòng duy nhất */}

                    <div className="question-text">

                      <MathContent value={q.content ?? q.text ?? q.question ?? ''} inline={true} />

                    </div>

                    <div className="options-grid">

                      {Object.entries(q.options || {}).map(([key, val]) => {

                        const isSelected = userAnswers[q.id] === key;

                        const isCorrectOption = detail?.correctAnswer === key;

                        let optionStyleClass = 'option-item';

                        if (isSelected) optionStyleClass += ' selected';

                        if (isSubmitted) {

                          if (isCorrectOption) optionStyleClass += ' correct';

                          if (isSelected && !detail?.isCorrect) optionStyleClass += ' incorrect';

                        }



                        return (

                          <label className={optionStyleClass} key={key}>

                            <input

                              type="radio"

                              name={`question-${q.id ?? idx}`}

                              checked={isSelected}

                              disabled={isSubmitted}

                              onChange={() => handleSelectOption(q.id, key)}

                            />

                            <span className="option-badge">{key}.</span>

                            <span className="option-text-content">

                              <MathContent value={val ?? ''} inline={true} />

                            </span>

                          </label>

                        );

                      })}

                    </div>



                    {isSubmitted && detail && (

                      <div className="explanation-box">

                        <div className="explanation-header">

                          <span>{detail.isCorrect ? '✅ Chính xác' : '❌ Chưa chính xác'}</span>

                          <span>Đáp án đúng: <strong>{detail.correctAnswer}</strong></span>

                        </div>

                        <div className="explanation-body">

                          <p><strong>🐰 Thỏ giải thích:</strong></p>

                          <MathContent value={detail.explanation || 'Chưa có lời giải chi tiết cho câu này.'} />

                        </div>

                      </div>

                    )}

                  </article>

                );

              })}

            </div>



            <div className="exam-footer-action">

              {!isSubmitted ? (

                <>
                  <button
                    className="btn-submit"
                    type="button"
                    disabled={isLoading}
                    onClick={() => void handleSubmit()}
                  >
                    🚀 Nộp bài thi ngay
                  </button>
                </>

              ) : (

                <div className="result-summary-card">

                  <div className="result-header-badge">🎉 Kết Quả Bài Thi</div>

                  <div className="score-big">

                    {result?.score ?? 0} <span className="score-total">/ {result?.totalQuestions ?? examData.questions.length}</span>

                  </div>

                  <p className="score-percentage">Đạt tỷ lệ chính xác: <strong>{result?.percentage ?? 0}%</strong></p>

                  <button
                    className="btn-primary"
                    type="button"
                    disabled={isLoading || !currentSubject}
                    onClick={() => currentSubject && handleStartRandomExam(currentSubject)}
                  >
                    🔄 Làm đề thi khác
                  </button>

                </div>

              )}

            </div>

          </div>

        )}

      </main>



      <footer className="app-footer">

        <p>Học cùng Thỏ · Kiên trì mỗi ngày, tiến bộ từng chút 🐰</p>

      </footer>

    </div>

  );

}
