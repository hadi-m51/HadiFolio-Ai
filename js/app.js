/* ============================================
   المرجع النظامي — Main App Logic
   ============================================ */

const API_BASE = '/api';

// ── Navigation ──
document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('active');
    });
  }

  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Scroll animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));

  // Active nav link
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    link.classList.toggle('active', href === currentPage);
  });

  // Dynamically populate search filters
  (async function loadDynamicFilters() {
    try {
      const browseLaw = document.getElementById('browseLaw');
      const quizLaw = document.getElementById('quizLaw');
      
      if (!browseLaw && !quizLaw) return;

      const resp = await fetch('/api/laws');
      if (!resp.ok) return;
      const data = await resp.json();
      
      if (data.laws && data.laws.length > 0) {
        if (browseLaw) {
          browseLaw.innerHTML = '<option value="">جميع الأنظمة</option>' + 
            data.laws.map(law => `<option value="${law}">${law}</option>`).join('');
        }
        if (quizLaw) {
          quizLaw.innerHTML = '<option value="">أسئلة شاملة (جميع الأنظمة)</option>' + 
            data.laws.map(law => `<option value="${law}">${law}</option>`).join('');
        }
      }
    } catch (e) {
      console.warn("Failed to load dynamic filters", e);
    }
  })();
});


// ── API Helper ──
async function apiCall(endpoint, data) {
  try {
    const resp = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `خطأ في الاستجابة: ${resp.status}`);
    }
    return await resp.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}


// ── Format Text ──
function formatAnswer(text) {
  if (!text) return '';
  // Bold markers
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Numbered lists
  html = html.replace(/^(\d+)\.\s/gm, '<br><strong>$1.</strong> ');
  // Bullet points
  html = html.replace(/^[-•]\s/gm, '<br>• ');
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  // Clean multiple <br>
  html = html.replace(/(<br>){3,}/g, '<br><br>');
  
  // Add disclaimer
  const disclaimer = `
    <div style="margin-top: 24px; padding: 12px; border-top: 1px dashed var(--slate-600); font-size: 0.8rem; color: var(--slate-400);">
      <strong>تنويه وإخلاء مسؤولية:</strong> النظام لا يزال قيد التطوير. الإجابات المولدة بواسطة الذكاء الاصطناعي قد تحتوي على معلومات غير دقيقة. يرجى دائماً مراجعة المصادر الرسمية، والنظام لا يتحمل أي مسؤولية قانونية.
    </div>
  `;
  return html + disclaimer;
}


// ── Source Tags ──
function renderSources(sources) {
  if (!sources || sources.length === 0) return '';
  const unique = [...new Set(sources.map(s => typeof s === 'string' ? s : s.law_title || s.source))];
  return '<div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px;">' +
    unique.map(s => `<span class="tag tag-gold"><i class="fa-regular fa-file-lines"></i> ${s}</span>`).join('') +
    '</div>';
}


// ── Chat Module ──
const Chat = {
  messagesEl: null,
  inputEl: null,

  init() {
    this.messagesEl = document.getElementById('chatMessages');
    this.inputEl = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');
    const form = document.getElementById('chatForm');

    if (!this.messagesEl || !this.inputEl) return;

    const send = () => {
      const q = this.inputEl.value.trim();
      if (q) this.send(q);
    };

    if (sendBtn) sendBtn.addEventListener('click', send);
    if (form) form.addEventListener('submit', e => { e.preventDefault(); send(); });
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  },

  addMessage(content, type = 'bot', raw = false) {
    const div = document.createElement('div');
    div.className = `chat-bubble ${type}`;
    div.innerHTML = raw ? content : formatAnswer(content);
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return div;
  },

  showTyping() {
    const div = document.createElement('div');
    div.className = 'typing-indicator';
    div.id = 'typingIndicator';
    div.innerHTML = '<span></span><span></span><span></span>';
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  },

  hideTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  },

  async send(question) {
    this.addMessage(question, 'user');
    this.inputEl.value = '';
    this.showTyping();

    try {
      const data = await apiCall('/query', { question });
      this.hideTyping();
      const content = formatAnswer(data.answer) + renderSources(data.sources);
      this.addMessage(content, 'bot', true);
    } catch (err) {
      this.hideTyping();
      this.addMessage('<i class="fa-solid fa-triangle-exclamation"></i> ' + (err.message || 'حدث خطأ. يرجى المحاولة لاحقاً.'), 'bot');
    }
  }
};


// ── Court Finder Module ──
const CourtFinder = {
  init() {
    const form = document.getElementById('courtForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desc = document.getElementById('courtDescription').value.trim();
      if (!desc) return;

      const resultEl = document.getElementById('courtResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري التحليل...</span></div>';

      try {
        const data = await apiCall('/court', { description: desc });
        resultEl.innerHTML = `
          <div class="result-card">
            <div class="result-header">
              <div class="result-icon" style="background:rgba(59,130,246,0.15);color:var(--blue-400)"><i class="fa-solid fa-landmark"></i></div>
              <div>
                <div class="result-title">نتيجة تحديد الاختصاص</div>
                <div class="result-source">${data.sources?.join(' • ') || ''}</div>
              </div>
            </div>
            <div class="result-text">${formatAnswer(data.answer)}</div>
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};


// ── Deadlines Module ──
const Deadlines = {
  init() {
    const form = document.getElementById('deadlinesForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const procedure = document.getElementById('deadlineProcedure').value.trim();
      if (!procedure) return;

      const resultEl = document.getElementById('deadlinesResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري البحث...</span></div>';

      try {
        const data = await apiCall('/deadlines', { procedure });
        resultEl.innerHTML = `
          <div class="result-card">
            <div class="result-header">
              <div class="result-icon" style="background:rgba(16,185,129,0.15);color:var(--emerald-400)"><i class="fa-solid fa-stopwatch"></i></div>
              <div>
                <div class="result-title">المدد النظامية</div>
              </div>
            </div>
            <div class="result-text">${formatAnswer(data.answer)}</div>
            ${renderSources(data.sources)}
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};


// ── Browse Module ──
const Browse = {
  currentPage: 1,
  currentLaw: '',
  currentSearch: '',

  init() {
    const form = document.getElementById('browseForm');
    if (!form) return;
    
    // Add "Show More" button container after results
    const container = document.getElementById('browseResult').parentElement;
    const moreBtnContainer = document.createElement('div');
    moreBtnContainer.id = 'browseMoreContainer';
    moreBtnContainer.style.textAlign = 'center';
    moreBtnContainer.style.marginTop = '20px';
    moreBtnContainer.classList.add('hidden');
    moreBtnContainer.innerHTML = '<button class="btn btn-secondary" onclick="Browse.loadMore()">عرض المزيد ↓</button>';
    container.appendChild(moreBtnContainer);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.currentLaw = document.getElementById('browseLaw').value;
      this.currentSearch = document.getElementById('browseSearch').value.trim();
      this.currentPage = 1;
      this.fetchResults(true);
    });
  },

  async fetchResults(isNewSearch = false) {
    const resultEl = document.getElementById('browseResult');
    const moreContainer = document.getElementById('browseMoreContainer');
    
    if (isNewSearch) {
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري التصفح...</span></div>';
      moreContainer.classList.add('hidden');
    } else {
      moreContainer.innerHTML = '<div class="loading-spinner" style="display:inline-block"></div>';
    }

    try {
      const data = await apiCall('/browse', { 
        law: this.currentLaw, 
        search: this.currentSearch,
        page: this.currentPage
      });
      
      if (isNewSearch) resultEl.innerHTML = ''; // clear loading state
      
      if (!data.results || data.results.length === 0) {
        if (isNewSearch) {
          resultEl.innerHTML = '<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-magnifying-glass"></i></div><h3>لم يتم العثور على نتائج</h3></div>';
        }
        moreContainer.classList.add('hidden');
        return;
      }
      
      const newHtml = data.results.map((r, i) => `
        <div class="result-card" style="animation-delay:${i * 0.05}s">
          <div class="result-header">
            <div class="result-icon" style="background:rgba(139,92,246,0.15);color:var(--violet-400)"><i class="fa-regular fa-file-lines"></i></div>
            <div>
              <div class="result-title">${r.law_title || r.source}</div>
              ${this.currentSearch ? `<div class="result-source">درجة التطابق: ${Math.round(r.score * 100)}%</div>` : ''}
            </div>
          </div>
          <div class="result-text">${r.text}</div>
        </div>`).join('');
        
      if (isNewSearch) {
        resultEl.innerHTML = newHtml;
      } else {
        resultEl.innerHTML += newHtml;
      }
      
      if (data.has_more) {
        moreContainer.classList.remove('hidden');
        moreContainer.innerHTML = '<button class="btn btn-secondary" onclick="Browse.loadMore()">عرض المزيد ↓</button>';
      } else {
        moreContainer.classList.add('hidden');
      }
    } catch (err) {
      if (isNewSearch) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      } else {
        alert('حدث خطأ أثناء تحميل المزيد: ' + err.message);
        moreContainer.innerHTML = '<button class="btn btn-secondary" onclick="Browse.loadMore()">إعادة المحاولة</button>';
      }
    }
  },
  
  loadMore() {
    this.currentPage++;
    this.fetchResults(false);
  }
};


// ── Classify Module ──
const Classify = {
  init() {
    const form = document.getElementById('classifyForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const facts = document.getElementById('classifyFacts').value.trim();
      if (!facts) return;

      const resultEl = document.getElementById('classifyResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري التصنيف...</span></div>';

      try {
        const data = await apiCall('/classify', { facts });
        resultEl.innerHTML = `
          <div class="result-card">
            <div class="result-header">
              <div class="result-icon" style="background:rgba(244,63,94,0.15);color:var(--rose-400)"><i class="fa-solid fa-clipboard-list"></i></div>
              <div>
                <div class="result-title">نتيجة التصنيف</div>
              </div>
            </div>
            <div class="result-text">${formatAnswer(data.answer)}</div>
            ${renderSources(data.sources)}
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};


// ── Compare Module ──
const Compare = {
  init() {
    const form = document.getElementById('compareForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const topic = document.getElementById('compareTopic').value.trim();
      const law1 = document.getElementById('compareLaw1').value;
      const law2 = document.getElementById('compareLaw2').value;
      if (!topic) return;

      const resultEl = document.getElementById('compareResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري المقارنة...</span></div>';

      try {
        const data = await apiCall('/compare', { topic, law1, law2 });
        resultEl.innerHTML = `
          <div class="result-card">
            <div class="result-header">
              <div class="result-icon" style="background:rgba(245,158,11,0.15);color:var(--amber-400)"><i class="fa-solid fa-scale-balanced"></i></div>
              <div>
                <div class="result-title">نتيجة المقارنة</div>
              </div>
            </div>
            <div class="result-text">${formatAnswer(data.answer)}</div>
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};


// ── Memo Module ──
const Memo = {
  init() {
    const form = document.getElementById('memoForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const type = document.getElementById('memoType').value;
      const facts = document.getElementById('memoFacts').value.trim();
      if (!facts) return;

      const resultEl = document.getElementById('memoResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري إعداد المذكرة...</span></div>';

      try {
        const data = await apiCall('/memo', { type, facts });
        resultEl.innerHTML = `
          <div class="memo-output">${formatAnswer(data.answer)}</div>
          ${renderSources(data.sources)}
          <div style="margin-top:16px; text-align:center">
            <button class="btn btn-secondary" onclick="copyMemo()"><i class="fa-solid fa-clipboard-list"></i> نسخ المذكرة</button>
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};

function copyMemo() {
  const el = document.querySelector('.memo-output');
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(() => {
      alert('<i class="fa-solid fa-circle-check"></i> تم نسخ المذكرة بنجاح');
    });
  }
}


// ── Quiz Module ──
const Quiz = {
  questions: [],
  currentIndex: 0,
  score: 0,
  answered: [],

  init() {
    const form = document.getElementById('quizStartForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const law = document.getElementById('quizLaw').value;
      const difficulty = document.getElementById('quizDifficulty').value;
      const count = document.getElementById('quizCount').value;

      document.getElementById('quizSetup').classList.add('hidden');
      const area = document.getElementById('quizArea');
      area.classList.remove('hidden');
      area.innerHTML = '<div class="flex-center" style="padding:60px 0"><div class="loading-spinner"></div><span style="margin-right:12px">جاري إعداد الأسئلة...</span></div>';

      try {
        const data = await apiCall('/quiz', { law, difficulty, count });
        if (data.questions && data.questions.length > 0) {
          this.questions = data.questions;
          this.currentIndex = 0;
          this.score = 0;
          this.answered = [];
          this.renderQuestion();
        } else {
          area.innerHTML = `<div class="empty-state"><div class="empty-icon"><i class="fa-solid fa-circle-question"></i></div><h3>لم يتم إنشاء أسئلة</h3><p>${data.raw || 'يرجى المحاولة مرة أخرى'}</p><button class="btn btn-primary mt-4" onclick="Quiz.restart()">إعادة المحاولة</button></div>`;
        }
      } catch (err) {
        area.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p><button class="btn btn-primary mt-4" onclick="Quiz.restart()">إعادة المحاولة</button></div>`;
      }
    });
  },

  renderQuestion() {
    const area = document.getElementById('quizArea');
    const q = this.questions[this.currentIndex];
    const total = this.questions.length;

    let progressHTML = '<div class="quiz-progress">';
    for (let i = 0; i < total; i++) {
      let cls = i === this.currentIndex ? 'active' : '';
      if (this.answered[i] !== undefined) {
        cls = this.answered[i] ? 'correct' : 'wrong';
      }
      progressHTML += `<div class="dot ${cls}"></div>`;
    }
    progressHTML += '</div>';

    area.innerHTML = `
      ${progressHTML}
      <div class="glass-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span class="tag tag-gold">سؤال ${this.currentIndex + 1} من ${total}</span>
          <span class="tag tag-emerald">النتيجة: ${this.score}/${this.currentIndex}</span>
        </div>
        <h3 style="margin-bottom:20px;line-height:1.8">${q.question}</h3>
        <div id="quizOptions">
          ${q.options.map((opt, i) => `
            <button class="quiz-option" onclick="Quiz.answer(${i})" data-index="${i}">
              ${opt}
            </button>
          `).join('')}
        </div>
        <div id="quizExplanation" class="hidden"></div>
      </div>`;
  },

  answer(selected) {
    const q = this.questions[this.currentIndex];
    const correct = q.correct;
    const isCorrect = selected === correct;

    if (isCorrect) this.score++;
    this.answered[this.currentIndex] = isCorrect;

    const options = document.querySelectorAll('.quiz-option');
    options.forEach((opt, i) => {
      opt.disabled = true;
      opt.style.pointerEvents = 'none';
      if (i === correct) opt.classList.add('correct');
      if (i === selected && !isCorrect) opt.classList.add('wrong');
    });

    const expEl = document.getElementById('quizExplanation');
    expEl.classList.remove('hidden');
    expEl.innerHTML = `
      <div class="result-card" style="margin-top:16px">
        <p style="color:${isCorrect ? 'var(--emerald-400)' : 'var(--rose-400)'};font-weight:700;margin-bottom:8px">
          ${isCorrect ? '<i class="fa-solid fa-circle-check"></i> إجابة صحيحة!' : '<i class="fa-solid fa-circle-xmark"></i> إجابة خاطئة'}
        </p>
        <p style="color:var(--white-70)">${q.explanation || ''}</p>
        <div style="margin-top:16px;text-align:center">
          ${this.currentIndex < this.questions.length - 1
            ? `<button class="btn btn-primary" onclick="Quiz.next()">السؤال التالي →</button>`
            : `<button class="btn btn-primary" onclick="Quiz.showResults()">عرض النتائج <i class="fa-solid fa-champagne-glasses"></i></button>`
          }
        </div>
      </div>`;
  },

  next() {
    this.currentIndex++;
    this.renderQuestion();
  },

  showResults() {
    const area = document.getElementById('quizArea');
    const total = this.questions.length;
    const pct = Math.round((this.score / total) * 100);
    let grade = '<i class="fa-regular fa-face-sad-tear"></i> يحتاج مراجعة';
    if (pct >= 90) grade = '<i class="fa-solid fa-trophy"></i> ممتاز!';
    else if (pct >= 70) grade = '<i class="fa-solid fa-hands-clapping"></i> جيد جداً';
    else if (pct >= 50) grade = '<i class="fa-solid fa-thumbs-up"></i> جيد';

    area.innerHTML = `
      <div class="glass-card score-card">
        <div class="score-circle">${pct}%</div>
        <h2 style="margin-bottom:8px">${grade}</h2>
        <p style="color:var(--white-50);margin-bottom:24px">أجبت على ${this.score} من ${total} بشكل صحيح</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="Quiz.restart()"><i class="fa-solid fa-rotate-right"></i> اختبار جديد</button>
          <a href="chat.html" class="btn btn-secondary"><i class="fa-solid fa-comments"></i> استشر المساعد</a>
        </div>
      </div>`;
  },

  restart() {
    document.getElementById('quizSetup').classList.remove('hidden');
    document.getElementById('quizArea').classList.add('hidden');
    this.questions = [];
    this.currentIndex = 0;
    this.score = 0;
    this.answered = [];
  }
};


// ── Glossary Module ──
const Glossary = {
  init() {
    const form = document.getElementById('glossaryForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const term = document.getElementById('glossaryTerm').value.trim();
      if (!term) return;

      const resultEl = document.getElementById('glossaryResult');
      resultEl.innerHTML = '<div class="flex-center"><div class="loading-spinner"></div><span style="margin-right:12px">جاري البحث...</span></div>';

      try {
        const data = await apiCall('/glossary', { term });
        resultEl.innerHTML = `
          <div class="result-card">
            <div class="result-header">
              <div class="result-icon" style="background:rgba(100,116,139,0.15);color:var(--slate-400)"><i class="fa-solid fa-book-open-reader"></i></div>
              <div>
                <div class="result-title">${term}</div>
              </div>
            </div>
            <div class="result-text">${formatAnswer(data.answer)}</div>
            ${renderSources(data.sources)}
          </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="result-card"><p><i class="fa-solid fa-triangle-exclamation"></i> ${err.message}</p></div>`;
      }
    });
  }
};


// ── Initialize Modules on Load ──
document.addEventListener('DOMContentLoaded', () => {
  Chat.init();
  CourtFinder.init();
  Deadlines.init();
  Browse.init();
  Classify.init();
  Compare.init();
  Memo.init();
  Quiz.init();
  Glossary.init();
});
