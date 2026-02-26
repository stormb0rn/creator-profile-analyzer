# Creator Profile Chrome Extension — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome extension that analyzes Twitter/X creator profiles with one click, showing stats and AI summary in a Side Panel.

**Architecture:** Chrome Extension (Manifest V3) with content script on x.com + Side Panel UI. Backend is a Vercel serverless API (`/api/analyze`) that calls TikHub for Twitter data and Claude API for AI summary. All API keys stored server-side.

**Tech Stack:** Chrome Extension Manifest V3, Side Panel API, Vercel serverless (Node.js), TikHub API, Anthropic SDK (`@anthropic-ai/sdk`), `claude-haiku-4-5` model.

---

## Task 1: Create the Vercel API endpoint `/api/analyze`

**Files:**
- Create: `api/analyze.mjs`

**Step 1: Create the analyze API endpoint**

```javascript
// api/analyze.mjs
// Accepts POST { screen_name }, returns creator profile JSON
// 1. Fetch user profile via TikHub fetch_user_profile
// 2. Fetch 30-day tweets via TikHub fetch_user_post_tweets (with pagination)
// 3. Filter to original tweets (conversation_id === tweet_id)
// 4. Calculate stats: avg likes, median likes, original post count
// 5. Pick top 3 tweets by likes
// 6. Call Claude Haiku to generate: category, summary, collaboration value
// 7. Return unified JSON

import Anthropic from '@anthropic-ai/sdk';

const TIKHUB_TOKEN = process.env.TIKHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AUTH_TOKEN = process.env.EXTENSION_AUTH_TOKEN; // simple bearer token

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Auth check
  const auth = req.headers.authorization;
  if (AUTH_TOKEN && auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { screen_name } = req.body;
  if (!screen_name) return res.status(400).json({ error: 'screen_name required' });

  try {
    // 1. Fetch profile
    const profileRes = await fetch(
      `https://api.tikhub.io/api/v1/twitter/web/fetch_user_profile?screen_name=${screen_name}`,
      { headers: { Authorization: `Bearer ${TIKHUB_TOKEN}` } }
    );
    const profileJson = await profileRes.json();
    const profile = profileJson?.data;
    if (!profile) return res.status(404).json({ error: 'User not found' });

    // 2. Fetch tweets with pagination (30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let allTweets = [];
    let cursor = '';
    let pages = 0;
    while (pages < 10) {
      const url = `https://api.tikhub.io/api/v1/twitter/web/fetch_user_post_tweets?screen_name=${screen_name}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
      const tweetsRes = await fetch(url, { headers: { Authorization: `Bearer ${TIKHUB_TOKEN}` } });
      const tweetsJson = await tweetsRes.json();
      const tweets = tweetsJson?.data?.timeline || tweetsJson?.data?.data || [];
      if (!tweets.length) break;

      let reachedOld = false;
      for (const t of tweets) {
        const createdAt = new Date(t.created_at).getTime();
        if (createdAt < thirtyDaysAgo) { reachedOld = true; break; }
        allTweets.push(t);
      }
      if (reachedOld) break;

      cursor = tweetsJson?.data?.next_cursor || '';
      if (!cursor) break;
      pages++;
    }

    // 3. Filter to original tweets
    const originals = allTweets.filter(t => {
      const convId = t.conversation_id || t.conversation_id_str;
      const tweetId = t.id || t.id_str || t.rest_id;
      return convId === tweetId;
    });

    // 4. Calculate stats
    const likes = originals.map(t => t.favorites || t.favorite_count || t?.legacy?.favorite_count || 0);
    const avgLikes = likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : 0;
    const medianLikes = likes.length ? (() => {
      const sorted = [...likes].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    })() : 0;

    // 5. Top 3 tweets
    const top3 = [...originals].sort((a, b) => (b.favorites || 0) - (a.favorites || 0)).slice(0, 3);

    // 6. Claude AI summary
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const tweetTexts = originals.slice(0, 15).map((t, i) =>
      `${i + 1}. [${t.favorites || 0} likes] ${(t.text || t.full_text || t?.legacy?.full_text || '').slice(0, 200)}`
    ).join('\n');

    const aiRes = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this Twitter creator and respond in JSON format:
{
  "category": "AI Agent" or "General" or "Tech" or "Crypto" or "Design" or "Startup",
  "summary": "One paragraph English summary of who they are, what content they create, and their collaboration value",
  "tags": ["tag1", "tag2", "tag3"]
}

Profile: @${screen_name}, ${profile.name}, ${profile.sub_count} followers
Bio: ${profile.desc || ''}
Location: ${profile.location || ''}

Recent tweets (last 30 days, ${originals.length} original posts):
${tweetTexts}`
      }]
    });
    const aiText = aiRes.content[0]?.text || '{}';
    let aiData = {};
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) aiData = JSON.parse(jsonMatch[0]);
    } catch {}

    // 7. Return
    res.json({
      profile: {
        screen_name: profile.profile || screen_name,
        name: profile.name,
        avatar: profile.avatar,
        desc: profile.desc,
        followers: profile.sub_count,
        location: profile.location,
        verified: profile.blue_verified,
        website: profile.website,
      },
      stats: {
        original_posts: originals.length,
        avg_likes: avgLikes,
        median_likes: medianLikes,
        total_tweets_30d: allTweets.length,
      },
      ai: aiData,
      top_tweets: top3.map(t => ({
        text: (t.text || t.full_text || '').slice(0, 280),
        likes: t.favorites || 0,
        retweets: t.retweets || 0,
        views: t.views || '0',
        created_at: t.created_at,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
```

**Step 2: Install Anthropic SDK**

Run: `cd /Users/jiajun/pika_work/creator-review-v2 && pnpm add @anthropic-ai/sdk`

**Step 3: Add environment variables to Vercel**

Run:
```bash
# Add ANTHROPIC_API_KEY and EXTENSION_AUTH_TOKEN to Vercel
vc-work env add ANTHROPIC_API_KEY
vc-work env add EXTENSION_AUTH_TOKEN
```

Note: TIKHUB_TOKEN should already be set. ANTHROPIC_API_KEY is the user's Claude API key. EXTENSION_AUTH_TOKEN is a random string for simple auth.

**Step 4: Test locally**

Run: `cd /Users/jiajun/pika_work/creator-review-v2 && npx vercel dev`
Then: `curl -X POST http://localhost:3000/api/analyze -H 'Content-Type: application/json' -d '{"screen_name":"clairevo"}'`

**Step 5: Deploy**

Run: `cd /Users/jiajun/pika_work/creator-review-v2 && vc-work deploy --prod`

**Step 6: Commit**

```bash
git add api/analyze.mjs package.json pnpm-lock.yaml
git commit -m "feat: add /api/analyze endpoint for creator profile analysis"
```

---

## Task 2: Create Chrome Extension scaffold

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/sidepanel.html`
- Create: `extension/sidepanel.js`
- Create: `extension/content.js`
- Create: `extension/background.js`
- Create: `extension/icons/` (placeholder icons)

**Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Creator Profile Analyzer",
  "version": "1.0.0",
  "description": "Analyze Twitter/X creator profiles with one click",
  "permissions": ["sidePanel", "activeTab", "storage"],
  "host_permissions": ["https://x.com/*", "https://twitter.com/*"],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [{
    "matches": ["https://x.com/*", "https://twitter.com/*"],
    "js": ["content.js"],
    "css": []
  }],
  "action": {
    "default_title": "Creator Profile Analyzer"
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

**Step 2: Create background.js (service worker)**

```javascript
// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_CREATOR') {
    analyzeCreator(message.screen_name).then(sendResponse);
    return true; // keep channel open for async
  }
});

async function analyzeCreator(screen_name) {
  const { apiUrl, authToken } = await chrome.storage.sync.get(['apiUrl', 'authToken']);
  const url = apiUrl || 'https://creator-review-v2-lake.vercel.app';
  try {
    const res = await fetch(`${url}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken ? `Bearer ${authToken}` : '',
      },
      body: JSON.stringify({ screen_name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { success: true, data: await res.json() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
```

**Step 3: Create content.js**

```javascript
// Detect screen_name from URL and inject analyze button
let currentScreenName = null;
let buttonInjected = false;

function getScreenName() {
  const match = location.pathname.match(/^\/([A-Za-z0-9_]+)\/?$/);
  if (!match) return null;
  const excluded = ['home', 'explore', 'search', 'notifications', 'messages', 'settings', 'i', 'compose'];
  return excluded.includes(match[1].toLowerCase()) ? null : match[1];
}

function injectButton() {
  if (buttonInjected) return;
  const screenName = getScreenName();
  if (!screenName || screenName === currentScreenName) return;
  currentScreenName = screenName;

  // Remove old button if exists
  const old = document.getElementById('creator-analyze-btn');
  if (old) old.remove();

  // Wait for profile header to load
  const observer = new MutationObserver(() => {
    const header = document.querySelector('[data-testid="UserName"]');
    if (!header) return;
    observer.disconnect();

    const btn = document.createElement('button');
    btn.id = 'creator-analyze-btn';
    btn.textContent = 'Analyze Creator';
    btn.style.cssText = 'margin-left:8px;padding:4px 12px;border-radius:16px;border:1px solid #536471;background:#1d9bf0;color:#fff;font-size:13px;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'ANALYZE_CREATOR', screen_name: screenName });
      chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' });
    });
    header.parentElement.appendChild(btn);
    buttonInjected = true;
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// Watch for URL changes (SPA navigation)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    buttonInjected = false;
    injectButton();
  }
}).observe(document.body, { childList: true, subtree: true });

injectButton();
```

**Step 4: Commit**

```bash
git add extension/
git commit -m "feat: add Chrome extension scaffold with manifest, content script, background worker"
```

---

## Task 3: Build the Side Panel UI

**Files:**
- Create: `extension/sidepanel.html`
- Create: `extension/sidepanel.js`
- Create: `extension/sidepanel.css`

**Step 1: Create sidepanel.html**

Single-page HTML with embedded styles. Dark theme matching the existing creator-review-v2 design.

Key sections:
- Settings form (API URL, auth token) — collapsible
- Loading spinner
- Profile card: avatar, name, handle, followers, verified badge
- Stats bar: original posts, avg likes, median likes
- AI section: category tag, summary paragraph, tags
- Top 3 tweets list
- Error state

**Step 2: Create sidepanel.js**

```javascript
// Listen for analysis results
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ANALYZE_RESULT') renderProfile(msg.data);
  if (msg.type === 'ANALYZE_ERROR') renderError(msg.error);
  if (msg.type === 'ANALYZE_LOADING') renderLoading(msg.screen_name);
});

// Also support direct analyze from the panel
document.getElementById('analyzeBtn')?.addEventListener('click', async () => {
  const handle = document.getElementById('handleInput').value.trim().replace('@', '');
  if (!handle) return;
  renderLoading(handle);
  chrome.runtime.sendMessage({ type: 'ANALYZE_CREATOR', screen_name: handle }, (response) => {
    if (response.success) renderProfile(response.data);
    else renderError(response.error);
  });
});

function renderLoading(screenName) { /* show spinner + "Analyzing @screenName..." */ }
function renderProfile(data) { /* render full profile card */ }
function renderError(error) { /* show error message */ }
```

**Step 3: Commit**

```bash
git add extension/sidepanel.html extension/sidepanel.js extension/sidepanel.css
git commit -m "feat: add Side Panel UI for creator profile display"
```

---

## Task 4: Wire up message passing and test end-to-end

**Files:**
- Modify: `extension/background.js`
- Modify: `extension/content.js`

**Step 1: Update background.js to relay results to side panel**

Add logic to:
- When ANALYZE_CREATOR message received, send ANALYZE_LOADING to side panel
- After API call completes, send ANALYZE_RESULT or ANALYZE_ERROR to side panel
- Handle OPEN_SIDEPANEL message by calling chrome.sidePanel.open()

**Step 2: Test end-to-end**

1. Load extension in Chrome: `chrome://extensions` → Developer mode → Load unpacked → select `extension/` folder
2. Navigate to `https://x.com/clairevo`
3. Click "Analyze Creator" button
4. Verify side panel opens and shows loading state
5. Verify profile card renders with correct data
6. Verify AI summary appears

**Step 3: Commit**

```bash
git add extension/
git commit -m "feat: wire up message passing between content script, background, and side panel"
```

---

## Task 5: Add settings page and polish

**Files:**
- Modify: `extension/sidepanel.html` (settings section)
- Modify: `extension/sidepanel.js` (settings persistence)

**Step 1: Add collapsible settings section**

- API URL field (defaults to production Vercel URL)
- Auth token field
- Save button that writes to chrome.storage.sync

**Step 2: Add error states and edge cases**

- Network error handling
- Rate limit display
- Empty profile handling
- "User not found" state

**Step 3: Generate simple icons**

Create placeholder 16x16, 48x48, 128x128 PNG icons for the extension.

**Step 4: Final commit**

```bash
git add extension/
git commit -m "feat: add settings, error handling, and icons to extension"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|----------------|
| 1 | Vercel `/api/analyze` endpoint | Medium — TikHub + Claude API integration |
| 2 | Chrome extension scaffold | Low — manifest + boilerplate |
| 3 | Side Panel UI | Medium — profile card design |
| 4 | Wire up message passing | Low — Chrome messaging API |
| 5 | Settings + polish | Low — chrome.storage + error states |
