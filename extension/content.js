// Detect screen_name from URL and inject analyze button
let currentScreenName = null;
let injected = false;

const EXCLUDED = new Set([
  'home', 'explore', 'search', 'notifications', 'messages',
  'settings', 'i', 'compose', 'login', 'signup', 'tos', 'privacy'
]);

function getScreenName() {
  const match = location.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
  if (!match) return null;
  return EXCLUDED.has(match[1].toLowerCase()) ? null : match[1];
}

function injectButton() {
  const screenName = getScreenName();
  if (!screenName) {
    // Not a profile page, remove button if exists
    const old = document.getElementById('creator-analyze-btn');
    if (old) old.remove();
    injected = false;
    currentScreenName = null;
    return;
  }
  if (screenName === currentScreenName && injected) return;
  currentScreenName = screenName;
  injected = false;

  // Remove old button
  const old = document.getElementById('creator-analyze-btn');
  if (old) old.remove();

  // Wait for profile header to appear
  const tryInject = () => {
    const header = document.querySelector('[data-testid="UserName"]');
    if (!header) return false;

    const btn = document.createElement('button');
    btn.id = 'creator-analyze-btn';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>Analyze`;
    btn.style.cssText = `
      margin-left: 8px;
      padding: 4px 14px;
      border-radius: 16px;
      border: 1px solid rgba(29,155,240,0.3);
      background: #1d9bf0;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      transition: background 0.15s;
      display: inline-flex;
      align-items: center;
    `;
    btn.addEventListener('mouseenter', () => btn.style.background = '#1a8cd8');
    btn.addEventListener('mouseleave', () => btn.style.background = '#1d9bf0');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.textContent = 'Analyzing...';
      btn.style.opacity = '0.7';
      chrome.runtime.sendMessage({ type: 'ANALYZE_CREATOR', screen_name: screenName });
    });

    header.parentElement.appendChild(btn);
    injected = true;
    return true;
  };

  if (!tryInject()) {
    const observer = new MutationObserver(() => {
      if (tryInject()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Timeout after 10s
    setTimeout(() => observer.disconnect(), 10000);
  }
}

// Watch for SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    injected = false;
    injectButton();
  }
}).observe(document.body, { childList: true, subtree: true });

injectButton();
