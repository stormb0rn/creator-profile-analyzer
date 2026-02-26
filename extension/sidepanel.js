const content = document.getElementById('content');
const analyzeBtn = document.getElementById('analyzeBtn');
const handleInput = document.getElementById('handleInput');

// --- i18n ---
let currentLang = 'en';
const i18n = {
  en: {
    analyze: 'Analyze',
    analyzing: 'Analyzing',
    fetchingTweets: 'Fetching tweets & generating AI summary',
    retry: 'Retry',
    noResponse: 'No response from background',
    emptyHint: 'Enter a Twitter handle above<br>or click "Analyze" on any x.com profile page',
    followers: 'followers',
    originalPosts: 'Original',
    totalTweets: 'Total',
    avgLikes: 'Avg Likes',
    medianLikes: 'Median',
    aiAnalysis: 'AI Analysis',
    topTweets: 'Top Tweets',
    settings: 'Settings',
    authLabel: 'Auth Token (optional)',
    save: 'Save',
    thirtyDay: '30d',
  },
  zh: {
    analyze: '分析',
    analyzing: '分析中',
    fetchingTweets: '正在拉取推文并生成 AI 总结',
    retry: '重试',
    noResponse: '后台无响应',
    emptyHint: '在上方输入 Twitter 用户名<br>或在 x.com 主页点击「Analyze」按钮',
    followers: '粉丝',
    originalPosts: '原创',
    totalTweets: '总推文',
    avgLikes: '平均赞',
    medianLikes: '中位赞',
    aiAnalysis: 'AI 分析',
    topTweets: '高赞推文',
    settings: '设置',
    authLabel: '认证 Token（可选）',
    save: '保存',
    thirtyDay: '30天',
  }
};

function t(key) { return i18n[currentLang][key] || i18n.en[key] || key; }

// Language toggle
document.getElementById('langEn').addEventListener('click', () => setLang('en'));
document.getElementById('langZh').addEventListener('click', () => setLang('zh'));

function setLang(lang) {
  currentLang = lang;
  chrome.storage.sync.set({ lang });
  document.getElementById('langEn').classList.toggle('active', lang === 'en');
  document.getElementById('langZh').classList.toggle('active', lang === 'zh');
  analyzeBtn.textContent = t('analyze');
  document.getElementById('emptyText') && (document.getElementById('emptyText').innerHTML = t('emptyHint'));
  document.getElementById('settingsToggle').textContent = t('settings');
  // Re-render if we have cached data
  if (lastData) renderProfile(lastData);
}

// Restore saved lang
chrome.storage.sync.get(['lang'], (r) => {
  if (r.lang) setLang(r.lang);
});

// Cache last result for re-render on lang switch
let lastData = null;

// Listen for messages from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ANALYZE_LOADING') {
    handleInput.value = msg.screen_name;
    renderLoading(msg.screen_name);
  } else if (msg.type === 'ANALYZE_RESULT') {
    lastData = msg.data;
    renderProfile(msg.data);
  } else if (msg.type === 'ANALYZE_ERROR') {
    renderError(msg.error);
  }
});

// Analyze button
analyzeBtn.addEventListener('click', () => {
  const handle = handleInput.value.trim().replace(/^@/, '');
  if (!handle) return;
  analyzeBtn.disabled = true;
  renderLoading(handle);
  chrome.runtime.sendMessage({ type: 'ANALYZE_CREATOR', screen_name: handle, lang: currentLang }, (response) => {
    analyzeBtn.disabled = false;
    if (!response) return renderError(t('noResponse'));
    if (response.success) { lastData = response.data; renderProfile(response.data); }
    else renderError(response.error);
  });
});

// Enter key
handleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyzeBtn.click(); });

// Settings
document.getElementById('settingsToggle').addEventListener('click', () => {
  document.getElementById('settingsForm').classList.toggle('open');
});
document.getElementById('saveSettings').addEventListener('click', () => {
  chrome.storage.sync.set({ authToken: document.getElementById('authTokenInput').value.trim() });
  document.getElementById('settingsForm').classList.remove('open');
});
chrome.storage.sync.get(['authToken'], (r) => {
  if (r.authToken) document.getElementById('authTokenInput').value = r.authToken;
});

// --- Render functions ---

function renderLoading(screenName) {
  content.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div>${t('analyzing')} @${esc(screenName)}...</div>
      <div class="sub">${t('fetchingTweets')}</div>
    </div>`;
}

function renderError(error) {
  analyzeBtn.disabled = false;
  content.innerHTML = `
    <div class="error">
      <div style="font-size:20px;margin-bottom:8px">&#9888;</div>
      <div style="font-size:13px">${esc(error)}</div>
      <button class="retry-btn" onclick="document.getElementById('analyzeBtn').click()">${t('retry')}</button>
    </div>`;
}

function renderProfile(data) {
  analyzeBtn.disabled = false;
  const p = data.profile;
  const s = data.stats;
  const ai = data.ai || {};
  const tweets = data.top_tweets || [];
  const catClass = 'cat-' + (ai.category || 'general').toLowerCase().replace(/\s+/g, '-');

  content.innerHTML = `
    <div class="profile-card">

      ${ai.summary ? `
      <div class="ai-hero">
        <div class="category-row">
          ${ai.category ? `<span class="category-tag ${catClass}">${esc(ai.category)}</span>` : ''}
          <span style="font-size:10px;color:#445">${t('aiAnalysis')}</span>
        </div>
        <div class="ai-summary">${esc(ai.summary)}</div>
        ${ai.tags && ai.tags.length ? `
          <div class="ai-tags">${ai.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
        ` : ''}
      </div>` : ''}

      <div class="profile-info">
        <div class="profile-row">
          <img src="${esc(p.avatar)}" alt="" />
          <div class="info">
            <div class="name">
              ${esc(p.name)}
              ${p.verified ? '<span class="verified-badge">&#10003;</span>' : ''}
            </div>
            <div class="handle">@${esc(p.screen_name)} · ${formatNum(p.followers)} ${t('followers')}</div>
          </div>
        </div>
        ${p.desc ? `<div class="profile-bio">${esc(p.desc)}</div>` : ''}
        <div class="profile-meta">
          ${p.location ? `<span>&#128205; ${esc(p.location)}</span>` : ''}
          ${p.website ? `<span><a href="${esc(p.website)}" target="_blank">${esc(p.website.replace(/^https?:\/\//, ''))}</a></span>` : ''}
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="value">${s.original_posts}</div>
          <div class="label">${t('originalPosts')}<br><span style="color:#333">${t('thirtyDay')}</span></div>
        </div>
        <div class="stat-card">
          <div class="value">${s.total_tweets_30d}</div>
          <div class="label">${t('totalTweets')}<br><span style="color:#333">${t('thirtyDay')}</span></div>
        </div>
        <div class="stat-card">
          <div class="value">${formatNum(s.avg_likes)}</div>
          <div class="label">${t('avgLikes')}</div>
        </div>
        <div class="stat-card">
          <div class="value">${formatNum(s.median_likes)}</div>
          <div class="label">${t('medianLikes')}</div>
        </div>
      </div>

      ${tweets.length ? `
      <div class="top-tweets-section">
        <div class="section-header">${t('topTweets')}</div>
        ${tweets.map(tw => `
          <div class="tweet-item">
            <div>${esc(tw.text)}</div>
            <div class="tweet-stats">
              <span>&#10084; ${formatNum(tw.likes)}</span>
              <span>&#128257; ${formatNum(tw.retweets)}</span>
              <span>&#128065; ${formatNum(parseInt(tw.views) || 0)}</span>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

    </div>`;
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function formatNum(n) {
  if (!n && n !== 0) return '0';
  n = Number(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
