/* ══════════════════════════════════════════════
   State
══════════════════════════════════════════════ */
const state = {
  files: {},         // date -> parsed data
  currentDate: null,
  activeSource: 'all',
  activeTrend: null, // 絞り込み中のトレンドキーワード
  summaries: {},     // articleKey -> summary string
  showJa: false,     // 日本語訳を表示するか（初期は原文表示）
  translations: {},  // `${date}:hn:${idx}` -> 日本語タイトル
  translating: false,
  apiKey: localStorage.getItem('anthropic_api_key') || '',
};

/* ══════════════════════════════════════════════
   Markdown Parser
   Parses the output of fetch_news.py
══════════════════════════════════════════════ */
function parseNewsMarkdown(md) {
  const result = { date: '', hn: [], zenn: [], qiita: [], apple: [], android: [], '9to5mac': [], '9to5google': [] };

  // Extract date from first line: # ITエンジニアニュース — YYYY-MM-DD
  const dateMatch = md.match(/^#.*?(\d{4}-\d{2}-\d{2})/m);
  if (dateMatch) result.date = dateMatch[1];

  // --- Hacker News section ---
  // Each HN entry:
  //   ### N. [Title](url)
  //   - スコア: **N** | 投稿者: username
  //   - HNコメント: https://...
  const hnSection = md.match(/## .*?Hacker News.*?\n([\s\S]*?)(?=\n## |$)/);
  if (hnSection) {
    const hnRaw = hnSection[1];
    const entries = hnRaw.split(/\n(?=### )/);
    entries.forEach(entry => {
      const titleLine = entry.match(/### \d+\.\s*\[(.+?)\]\((.+?)\)/);
      const scoreLine = entry.match(/スコア:\s*\*\*(\d+)\*\*\s*\|\s*投稿者:\s*(\S+)/);
      const hnLine   = entry.match(/HNコメント:\s*(https?:\/\/\S+)/);
      if (!titleLine) return;
      result.hn.push({
        title:  titleLine[1],
        url:    titleLine[2],
        score:  scoreLine ? parseInt(scoreLine[1], 10) : 0,
        by:     scoreLine ? scoreLine[2] : '',
        hn_url: hnLine ? hnLine[1] : '',
      });
    });
  }

  // --- Zenn / Qiita sections ---
  // Each entry: N. [Title](url) — *author*  (author optional)
  function parseRssSection(sectionMd) {
    const items = [];
    const lines = sectionMd.split('\n');
    lines.forEach(line => {
      const m = line.match(/^\d+\.\s*\[(.+?)\]\((.+?)\)(?:\s*—\s*\*(.+?)\*)?/);
      if (m) items.push({ title: m[1], url: m[2], author: m[3] || '' });
    });
    return items;
  }

  const zennSection = md.match(/## .*?Zenn.*?\n([\s\S]*?)(?=\n## |$)/);
  if (zennSection) result.zenn = parseRssSection(zennSection[1]);

  const qiitaSection = md.match(/## .*?Qiita.*?\n([\s\S]*?)(?=\n## |$)/);
  if (qiitaSection) result.qiita = parseRssSection(qiitaSection[1]);

  const appleSection = md.match(/## .*?Apple Developer.*?\n([\s\S]*?)(?=\n## |$)/);
  if (appleSection) result.apple = parseRssSection(appleSection[1]);

  const androidSection = md.match(/## .*?Android Developers.*?\n([\s\S]*?)(?=\n## |$)/);
  if (androidSection) result.android = parseRssSection(androidSection[1]);

  const macSection = md.match(/## .*?9to5Mac.*?\n([\s\S]*?)(?=\n## |$)/);
  if (macSection) result['9to5mac'] = parseRssSection(macSection[1]);

  const googleSection = md.match(/## .*?9to5Google.*?\n([\s\S]*?)(?=\n## |$)/);
  if (googleSection) result['9to5google'] = parseRssSection(googleSection[1]);

  return result;
}

/* ══════════════════════════════════════════════
   Demo data (used when no file is loaded)
══════════════════════════════════════════════ */
function buildDemoData() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    date: today,
    hn: [
      { title: 'Cloudflare announces zero-latency AI inference at the edge', url: 'https://blog.cloudflare.com/', score: 1247, by: 'cf_team', hn_url: 'https://news.ycombinator.com/' },
      { title: 'SQLite turns 25: a retrospective on the world\'s most deployed DB', url: 'https://sqlite.org/', score: 889, by: 'drhipp', hn_url: 'https://news.ycombinator.com/' },
      { title: 'Zig 0.14 released with incremental compilation by default', url: 'https://ziglang.org/', score: 742, by: 'ziglang', hn_url: 'https://news.ycombinator.com/' },
      { title: 'Ask HN: What tools do you use for local LLM development?', url: 'https://news.ycombinator.com/', score: 634, by: 'throwaway_llm', hn_url: 'https://news.ycombinator.com/' },
      { title: 'PostgreSQL 18 beta: NUMA-aware memory management', url: 'https://postgresql.org/', score: 521, by: 'pgdev', hn_url: 'https://news.ycombinator.com/' },
      { title: 'The unreasonable effectiveness of fuzzing in finding security bugs', url: 'https://example.com/', score: 410, by: 'sec_researcher', hn_url: 'https://news.ycombinator.com/' },
    ],
    zenn: [
      { title: 'Rustの所有権を図解で完全理解する', url: 'https://zenn.dev/', author: 'riku_dev' },
      { title: 'Next.js 15 のキャッシュ戦略を整理する — PPRとFull Route Cache', url: 'https://zenn.dev/', author: 'frontend_lab' },
      { title: 'Claude Code × GitHub Actions で自動コードレビュー環境を構築', url: 'https://zenn.dev/', author: 'devops_jp' },
      { title: 'TypeScript の satisfies 演算子を使い倒す', url: 'https://zenn.dev/', author: 'ts_lover' },
      { title: 'Bun 1.2 で変わったこと全部まとめ', url: 'https://zenn.dev/', author: 'bun_fan' },
    ],
    qiita: [
      { title: 'k8s Operator パターンを1から実装してみた', url: 'https://qiita.com/', author: 'k8s_fan' },
      { title: 'PostgreSQL 17 の新機能まとめ', url: 'https://qiita.com/', author: 'db_engineer' },
      { title: 'AWS CDK v2 でマルチアカウント環境を管理する', url: 'https://qiita.com/', author: 'cloud_arch' },
      { title: 'Go 1.24 の range-over func を実践投入した', url: 'https://qiita.com/', author: 'gopher_jp' },
      { title: 'Dify で社内RAGシステムを1日で構築する', url: 'https://qiita.com/', author: 'ai_builder' },
    ],
  };
}

/* ══════════════════════════════════════════════
   Render helpers
══════════════════════════════════════════════ */
function articleKey(source, idx) {
  return `${source}:${idx}`;
}

function sourceLabel(source) {
  const map = {
    hn:        '<span class="dot dot-hn"></span>Hacker News',
    zenn:      '<span class="dot dot-zenn"></span>Zenn',
    qiita:     '<span class="dot dot-qiita"></span>Qiita',
    apple:     '<span class="dot dot-apple"></span>Apple Dev',
    android:   '<span class="dot dot-android"></span>Android',
    '9to5mac': '<span class="dot dot-9to5mac"></span>9to5Mac',
    '9to5google': '<span class="dot dot-9to5google"></span>9to5Google',
  };
  return map[source] || '';
}

function sourceBadgeClass(source) {
  return `badge-${source}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

function renderCard(article, source, idx, isLead) {
  const key = articleKey(source, idx);
  const summary = state.summaries[key];
  const delay = (idx * 0.04).toFixed(2);

  // 翻訳タイトル（HNのみ）
  const transKey = `${state.currentDate}:hn:${idx}`;
  const jaTitle = source === 'hn' ? state.translations[transKey] : null;
  const displayTitle = (state.showJa && jaTitle) ? jaTitle : article.title;
  const showOrig = state.showJa && jaTitle;

  const summaryHtml = summary
    ? `<div class="ai-block">
        <div class="ai-block-header">
          <span class="dot dot-ai"></span>
          <span class="ai-label">AI 要約</span>
        </div>
        <div class="ai-text">${escHtml(summary)}</div>
      </div>`
    : `<button class="summarize-btn" onclick="summarizeArticle('${escHtml(key)}','${escHtml(article.title)}','${escHtml(article.url)}',this)">
        AI 要約を生成
      </button>`;

  const metaHtml = source === 'hn'
    ? `<span class="score-chip">▲ ${article.score.toLocaleString()}</span><span>${escHtml(article.by)}</span>`
    : `${article.author ? `<span>@${escHtml(article.author)}</span>` : ''}`;

  return `<div class="card${isLead ? ' lead' : ''}" style="animation-delay:${delay}s">
    <span class="source-badge ${sourceBadgeClass(source)}">${sourceLabel(source)}</span>
    <div class="card-title">
      <a href="${escHtml(article.url)}" target="_blank" rel="noopener">${escHtml(displayTitle)}</a>
      ${showOrig ? `<div class="orig-title">${escHtml(article.title)}</div>` : ''}
    </div>
    ${summaryHtml}
    <div class="card-meta">${metaHtml}</div>
  </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ══════════════════════════════════════════════
   Trend tags (extract from titles)
══════════════════════════════════════════════ */
function extractTrends(data) {
  const keywords = ['AI', 'LLM', 'Rust', 'Go', 'TypeScript', 'PostgreSQL', 'SQLite',
    'Kubernetes', 'k8s', 'AWS', 'Cloudflare', 'Next.js', 'React', 'Bun', 'Zig',
    'Claude', 'RAG', 'CDK', 'Docker', 'セキュリティ', 'パフォーマンス',
    'Swift', 'SwiftUI', 'Xcode', 'iOS', 'macOS', 'visionOS', 'watchOS',
    'Android', 'Kotlin', 'Jetpack', 'Compose', 'Wear OS', 'Google Play',
    'iPhone', 'Apple', 'Gemini'];
  const counts = {};
  const all = ['hn','zenn','qiita','apple','android','9to5mac','9to5google']
    .flatMap(k => (data[k] || []).map(a => a.title));
  all.forEach(title => {
    keywords.forEach(kw => {
      if (title.toLowerCase().includes(kw.toLowerCase())) {
        counts[kw] = (counts[kw] || 0) + 1;
      }
    });
  });
  return Object.entries(counts)
    .filter(([,n]) => n > 0)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 10)
    .map(([kw]) => kw);
}

/* ══════════════════════════════════════════════
   Render main view
══════════════════════════════════════════════ */
function renderNews(data) {
  let articles = [];
  const src = state.activeSource;

  const sources = ['hn','zenn','qiita','apple','android','9to5mac','9to5google'];
  sources.forEach(s => {
    if (src === 'all' || src === s) {
      (data[s] || []).forEach((a, i) => articles.push({...a, source: s, idx: i}));
    }
  });

  // トレンドキーワードで絞り込み
  const kw = state.activeTrend;
  if (kw) {
    articles = articles.filter(a => a.title.toLowerCase().includes(kw.toLowerCase()));
  }

  const trends = extractTrends(data);

  const trendHtml = trends.length ? `
    <div class="trend-bar">
      <span class="trend-label">トレンド</span>
      ${trends.map(t => `<span class="trend-tag${t === kw ? ' active' : ''}" onclick="filterTrend('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
      ${kw ? `<span class="trend-clear" onclick="filterTrend(null)">✕ クリア</span>` : ''}
    </div>` : '';

  const totalCount = ['hn','zenn','qiita','apple','android','9to5mac','9to5google']
    .reduce((s, k) => s + (data[k] ? data[k].length : 0), 0);
  const countLabel = kw
    ? `${articles.length}件（"${escHtml(kw)}" で絞り込み中）`
    : `${totalCount}件の記事`;

  const cardsHtml = articles.length
    ? articles.map((a, globalIdx) => renderCard(a, a.source, a.idx, globalIdx < 3)).join('')
    : `<div style="padding:40px 18px;color:var(--ink3);font-family:'JetBrains Mono',monospace;font-size:12px">"${escHtml(kw)}" に一致する記事はありません。</div>`;

  const colClass = articles.length < 2 ? 'one-col' : articles.length < 3 ? 'two-col' : (src === 'all' ? '' : 'two-col');

  const reloadLabel = window.showDirectoryPicker ? 'フォルダを再読み込み' : 'ファイルを追加';

  const srcNames = { all:'全ソース', hn:'Hacker News', zenn:'Zenn', qiita:'Qiita',
    apple:'Apple Developer', android:'Android', '9to5mac':'9to5Mac', '9to5google':'9to5Google' };
  const sectionTitle = kw
    ? `"${escHtml(kw)}" の記事`
    : (srcNames[src] || src) + ' — 本日の記事';

  const langBtnLabel = state.showJa ? '🌐 原文を表示' : '🌐 日本語を表示';
  const transIndicator = state.translating
    ? `<span class="translating-badge">翻訳中...</span>` : '';

  // 「日本語を表示」は翻訳済み or APIキーがある場合のみ有効
  const hasTranslations = !!state.translations[`${state.currentDate}:hn:0`];
  const jaDisabled = !state.showJa && !hasTranslations && !state.apiKey;
  const langBtnTitle = jaDisabled ? 'フッターに Anthropic API キーを設定してください' : '';

  return `
    ${trendHtml}
    <div class="layout">
      <div class="toolbar">
        <span class="counts">${countLabel}</span>
        <div style="display:flex;gap:8px;align-items:center">
          ${transIndicator}
          <button class="lang-toggle${state.showJa ? ' ja-active' : ''}"
            onclick="toggleLang()"
            ${jaDisabled ? 'disabled title="フッターに Anthropic API キーを設定してください"' : `title="${langBtnTitle}"`}
            style="${jaDisabled ? 'opacity:0.4;cursor:not-allowed;' : ''}"
          >${langBtnLabel}</button>
          <button class="new-file-btn" onclick="openFolder()">${reloadLabel}</button>
        </div>
      </div>
      <div class="section-rule">
        <div class="section-rule-thick"></div>
        <div class="section-rule-title">${sectionTitle}</div>
        <div class="section-rule-thin"></div>
      </div>
      <div class="news-grid ${colClass}">${cardsHtml}</div>
    </div>`;
}

/* ══════════════════════════════════════════════
   Render picker (initial state)
══════════════════════════════════════════════ */
function renderPicker() {
  const hasApi = !!window.showDirectoryPicker;
  return `<div class="layout">
    <div class="state-screen">
      <div class="picker-zone" id="drop-zone" onclick="openFolder()">
        <div class="picker-icon">📰</div>
        <div class="picker-label">${hasApi ? 'news フォルダを選択' : 'Markdown ファイルを選択'}</div>
        <div class="picker-hint" style="margin-top:6px">
          ${hasApi
            ? 'クリックして news/ フォルダを開くと<br>全ファイルを自動読み込みします'
            : 'news_YYYY-MM-DD.md を選択してください<br>（複数選択可）'}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--ink3)">— または —</span>
        <button class="demo-btn" onclick="loadDemo()">デモデータで見る</button>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════
   Date pulldown (in masthead)
══════════════════════════════════════════════ */
function renderDateSelect() {
  const dates = Object.keys(state.files).sort().reverse();
  const sel = document.getElementById('date-select');
  if (!sel) return;

  if (dates.length === 0) {
    sel.innerHTML = '<option value="">選択してください</option>';
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  sel.innerHTML = dates.map(d =>
    `<option value="${d}" ${d === state.currentDate ? 'selected' : ''}>${d}（${formatDateShort(d)}）</option>`
  ).join('');
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
}

/* ══════════════════════════════════════════════
   Main render
══════════════════════════════════════════════ */
function render() {
  const app = document.getElementById('app');
  if (!state.currentDate) {
    app.innerHTML = renderPicker();
  } else {
    app.innerHTML = renderNews(state.files[state.currentDate]);
  }
  updateMasthead();
  renderDateSelect();
}

function updateMasthead() {
  const el = document.getElementById('masthead-date');
  const d = state.currentDate;
  el.textContent = d
    ? formatDate(d) + ' 版'
    : new Date().toLocaleDateString('ja-JP', { year:'numeric', month:'long', day:'numeric' });

  const count = Object.keys(state.files).length;
  document.getElementById('footer-info').textContent = count
    ? `${count} 版 読み込み済み`
    : 'news/ フォルダを選択してください';
}

/* ══════════════════════════════════════════════
   File loading helpers
══════════════════════════════════════════════ */
function loadMarkdown(text, filename) {
  const data = parseNewsMarkdown(text);
  if (!data.date) {
    const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
    data.date = m ? m[1] : new Date().toISOString().slice(0, 10);
  }
  state.files[data.date] = data;
  return data.date;
}

function loadDemo() {
  const data = buildDemoData();
  state.files[data.date] = data;
  state.currentDate = data.date;
  render();
}

/* ══════════════════════════════════════════════
   Folder / file open
   - Modern browsers: File System Access API → read whole folder
   - Fallback: <input multiple> for individual files
══════════════════════════════════════════════ */
async function openFolder() {
  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      const loadedDates = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind !== 'file') continue;
        if (!name.endsWith('.md') || !name.includes('news_')) continue;
        const file = await handle.getFile();
        const text = await file.text();
        const date = loadMarkdown(text, name);
        loadedDates.push(date);
      }
      if (loadedDates.length > 0) {
        // Select the latest date
        const latest = loadedDates.sort().reverse()[0];
        state.currentDate = latest;
      }
      render();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Folder open error:', err);
    }
  } else {
    // Fallback: multi-file input
    document.getElementById('file-input').click();
  }
}

/* Fallback file input (multiple) */
document.getElementById('file-input').addEventListener('change', async e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  const loadedDates = [];
  for (const file of files) {
    const text = await file.text();
    const date = loadMarkdown(text, file.name);
    loadedDates.push(date);
  }
  if (loadedDates.length > 0) {
    state.currentDate = loadedDates.sort().reverse()[0];
  }
  render();
  e.target.value = '';
});

/* ══════════════════════════════════════════════
   Date pulldown change handler
══════════════════════════════════════════════ */
document.getElementById('date-select').addEventListener('change', e => {
  switchDate(e.target.value);
});

/* ══════════════════════════════════════════════
   API key management
══════════════════════════════════════════════ */
function setApiKey() {
  const input = document.getElementById('apikey-input');
  if (!input) return;
  state.apiKey = input.value.trim();
  localStorage.setItem('anthropic_api_key', state.apiKey);
  input.blur();
  // キー設定後、未翻訳なら翻訳を試みる
  if (state.currentDate && state.showJa) {
    translateAll(state.files[state.currentDate], state.currentDate);
  }
}

/* ══════════════════════════════════════════════
   Shared API helper
══════════════════════════════════════════════ */
async function callApi(body) {
  if (!state.apiKey) throw new Error('APIキーが未設定です。フッターの入力欄に設定してください。');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

/* ══════════════════════════════════════════════
   Translation
══════════════════════════════════════════════ */
async function translateAll(data, date) {
  if (!data || !data.hn.length) return;

  // localStorage キャッシュを確認
  const cacheKey = `translations:${date}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      Object.assign(state.translations, JSON.parse(cached));
      render();
      return;
    } catch {}
  }

  // すでに翻訳済みかチェック
  if (state.translations[`${date}:hn:0`]) return;
  if (!state.apiKey) return; // キー未設定は黙って待つ

  state.translating = true;
  render();

  const titles = data.hn.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
  try {
    const result = await callApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: 'ITエンジニア向けニュースの英語タイトルを日本語に翻訳します。番号付きリストで与えられた各タイトルを、同じ番号付きで自然な日本語に翻訳してください。固有名詞・製品名・ブランド名はそのまま残してください。翻訳のみを返してください。',
      messages: [{ role: 'user', content: titles }],
    });

    const text = result.content?.[0]?.text || '';
    const newEntries = {};
    text.split('\n').forEach(line => {
      const m = line.match(/^(\d+)\.\s+(.+)/);
      if (!m) return;
      const i = parseInt(m[1], 10) - 1;
      const key = `${date}:hn:${i}`;
      state.translations[key] = m[2].trim();
      newEntries[key] = m[2].trim();
    });
    localStorage.setItem(cacheKey, JSON.stringify(newEntries));
  } catch (err) {
    console.warn('翻訳エラー:', err.message);
  }

  state.translating = false;
  render();
}

/* ══════════════════════════════════════════════
   Language toggle
══════════════════════════════════════════════ */
function toggleLang() {
  const hasTranslations = !!state.translations[`${state.currentDate}:hn:0`];
  // 日本語表示に切り替えようとしているが、翻訳もAPIキーもない場合は何もしない
  if (!state.showJa && !hasTranslations && !state.apiKey) return;

  state.showJa = !state.showJa;
  if (state.showJa && state.currentDate) {
    const data = state.files[state.currentDate];
    translateAll(data, state.currentDate);
  } else {
    render();
  }
}

/* ══════════════════════════════════════════════
   Trend filter
══════════════════════════════════════════════ */
function filterTrend(kw) {
  // 同じキーワードを再クリックしたら解除
  state.activeTrend = (kw && kw !== state.activeTrend) ? kw : null;
  if (state.currentDate) render();
}

/* ══════════════════════════════════════════════
   Edition tabs
══════════════════════════════════════════════ */
document.getElementById('edition-bar').addEventListener('click', e => {
  const tab = e.target.closest('.edition-tab');
  if (!tab) return;
  document.querySelectorAll('.edition-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  state.activeSource = tab.dataset.source;
  state.activeTrend = null;
  if (state.currentDate) render();
});

/* ══════════════════════════════════════════════
   AI Summary (Anthropic API)
══════════════════════════════════════════════ */
async function summarizeArticle(key, title, url, btn) {
  btn.disabled = true;
  btn.textContent = '生成中...';

  const placeholder = document.createElement('div');
  placeholder.className = 'ai-block';
  placeholder.innerHTML = `
    <div class="ai-block-header">
      <span class="dot dot-ai"></span>
      <span class="ai-label">AI 要約</span>
    </div>
    <div class="ai-generating ai-text">生成中<span id="dots-${key.replace(':','_')}">...</span></div>`;
  btn.replaceWith(placeholder);

  let dotCount = 0;
  const dotsEl = document.getElementById(`dots-${key.replace(':','_')}`);
  const dotInterval = setInterval(() => {
    if (!dotsEl) return clearInterval(dotInterval);
    dotCount = (dotCount + 1) % 4;
    dotsEl.textContent = '.'.repeat(dotCount + 1);
  }, 400);

  try {
    const data = await callApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: 'あなたはITエンジニア向けニュースの要約者です。記事タイトルとURLから、日本人エンジニアにとっての技術的な重要性・背景・影響を60字以内の日本語1文で要約してください。体言止めは避け、簡潔でわかりやすい文体にしてください。要約のみを返してください。',
      messages: [{ role: 'user', content: `タイトル: ${title}\nURL: ${url}` }],
    });
    clearInterval(dotInterval);
    const summary = data.content?.[0]?.text?.trim() || '要約を取得できませんでした。';
    state.summaries[key] = summary;
    placeholder.innerHTML = `
      <div class="ai-block-header">
        <span class="dot dot-ai"></span>
        <span class="ai-label">AI 要約</span>
      </div>
      <div class="ai-text">${escHtml(summary)}</div>`;
  } catch (err) {
    clearInterval(dotInterval);
    placeholder.innerHTML = `
      <div class="ai-block-header">
        <span class="dot dot-ai"></span>
        <span class="ai-label">AI 要約</span>
      </div>
      <div class="ai-text" style="color:var(--ink3);font-style:normal;font-size:11px">要約を生成できませんでした（${escHtml(err.message)}）</div>`;
  }
}

/* ══════════════════════════════════════════════
   Auto-load from news/index.json (HTTP server)
══════════════════════════════════════════════ */
async function autoLoadFromServer() {
  try {
    const res = await fetch('news/index.json');
    if (!res.ok) return false;
    const files = await res.json();
    if (!Array.isArray(files) || files.length === 0) return false;

    const loadedDates = [];
    for (const filename of files) {
      const mdRes = await fetch(`news/${filename}`);
      if (!mdRes.ok) continue;
      const text = await mdRes.text();
      const date = loadMarkdown(text, filename);
      loadedDates.push(date);
    }
    if (loadedDates.length === 0) return false;
    state.currentDate = loadedDates.sort().reverse()[0];
    return true;
  } catch {
    return false;
  }
}

function switchDate(date) {
  if (!date) return;
  state.currentDate = date;
  // キャッシュ済み翻訳があれば読み込む
  const cached = localStorage.getItem(`translations:${date}`);
  if (cached) {
    try { Object.assign(state.translations, JSON.parse(cached)); } catch {}
  }
  render();
  // 日本語表示中なら翻訳を実行
  if (state.showJa) translateAll(state.files[date], date);
}

/* ══════════════════════════════════════════════
   Init
══════════════════════════════════════════════ */
autoLoadFromServer().then(loaded => {
  render();
  // 保存済み API キーを入力欄に反映
  const apikeyEl = document.getElementById('apikey-input');
  if (apikeyEl && state.apiKey) apikeyEl.value = state.apiKey;
  // キャッシュ済み翻訳があれば読み込んでおく（API は叩かない）
  if (loaded && state.currentDate) {
    const cached = localStorage.getItem(`translations:${state.currentDate}`);
    if (cached) {
      try { Object.assign(state.translations, JSON.parse(cached)); } catch {}
    }
  }
});
