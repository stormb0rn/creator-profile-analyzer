// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const API_URL = 'https://creator-review-v2-lake.vercel.app';

// Listen for messages from content script or side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_CREATOR') {
    // Notify side panel of loading state
    chrome.runtime.sendMessage({ type: 'ANALYZE_LOADING', screen_name: message.screen_name }).catch(() => {});

    // Open side panel
    if (sender.tab) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    }

    // Call API
    analyzeCreator(message.screen_name, message.lang).then(result => {
      chrome.runtime.sendMessage(result).catch(() => {});
      sendResponse(result);
    });
    return true; // keep channel open for async
  }
});

async function analyzeCreator(screen_name, lang) {
  const { authToken } = await chrome.storage.sync.get(['authToken']);
  try {
    const res = await fetch(`${API_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ screen_name, lang: lang || 'en' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return { type: 'ANALYZE_RESULT', success: true, data };
  } catch (e) {
    return { type: 'ANALYZE_ERROR', success: false, error: e.message };
  }
}
