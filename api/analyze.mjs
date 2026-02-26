const TIKHUB_TOKEN = process.env.TIKHUB_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AUTH_TOKEN = process.env.EXTENSION_AUTH_TOKEN;

async function tikhub(endpoint, params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.tikhub.io/api/v1/twitter/web/${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${TIKHUB_TOKEN}` },
  });
  return res.json();
}

// Fetch 30-day tweets with pagination
async function fetchRecentTweets(screenName) {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const allTweets = [];
  let cursor = '';
  let pages = 0;

  while (pages < 10) {
    const params = { screen_name: screenName };
    if (cursor) params.cursor = cursor;
    const json = await tikhub('fetch_user_post_tweet', params);
    const tweets = json?.data?.timeline || json?.data?.data || [];
    if (!tweets.length) break;

    let reachedOld = false;
    for (const t of tweets) {
      const createdAt = new Date(t.created_at).getTime();
      if (createdAt < thirtyDaysAgo) { reachedOld = true; break; }
      allTweets.push(t);
    }
    if (reachedOld) break;

    cursor = json?.data?.next_cursor || '';
    if (!cursor) break;
    pages++;
  }
  return allTweets;
}

// Filter to original tweets (not replies, not retweets)
function filterOriginals(tweets) {
  return tweets.filter(t => {
    const convId = t.conversation_id || t.conversation_id_str;
    const tweetId = t.tweet_id || t.id || t.id_str || t.rest_id;
    return String(convId) === String(tweetId);
  });
}

function getLikes(t) {
  return t.favorites || t.favorite_count || t?.legacy?.favorite_count || 0;
}

function calcStats(originals) {
  const likes = originals.map(getLikes);
  if (!likes.length) return { avg: 0, median: 0 };
  const avg = Math.round(likes.reduce((a, b) => a + b, 0) / likes.length);
  const sorted = [...likes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { avg, median };
}

async function aiSummary(profile, originals, screenName, lang) {
  const tweetTexts = originals.slice(0, 15).map((t, i) =>
    `${i + 1}. [${getLikes(t)} likes] ${(t.text || t.full_text || t?.legacy?.full_text || '').slice(0, 200)}`
  ).join('\n');

  const isZh = lang === 'zh';
  const summaryInstruction = isZh
    ? '"summary": "一段中文总结：这个人是谁、创作什么内容、对AI视频公司的合作价值"'
    : '"summary": "One paragraph English summary: who they are, what content they create, collaboration value for an AI video company"';

  const prompt = `Analyze this Twitter creator. Respond ONLY with valid JSON, no other text:
{
  "category": "AI Agent" | "General" | "Tech" | "Crypto" | "Design" | "Startup" | "Marketing",
  ${summaryInstruction},
  "tags": ["tag1", "tag2", "tag3"]
}

Profile: @${screenName}, ${profile.name}, ${profile.sub_count} followers
Bio: ${profile.desc || 'N/A'}
Location: ${profile.location || 'N/A'}

Recent original tweets (last 30 days, ${originals.length} posts):
${tweetTexts}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'anthropic/claude-haiku-4-5',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content || '{}';
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch {}
  return { category: 'General', summary: '', tags: [] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Simple auth check
  const auth = req.headers.authorization;
  if (AUTH_TOKEN && auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { screen_name } = req.body || {};
  if (!screen_name) return res.status(400).json({ error: 'screen_name required' });

  try {
    // 1. Profile
    const profileJson = await tikhub('fetch_user_profile', { screen_name });
    const profile = profileJson?.data;
    if (!profile) return res.status(404).json({ error: 'User not found' });

    // 2. Tweets
    const allTweets = await fetchRecentTweets(screen_name);

    // 3. Original tweets only
    const originals = filterOriginals(allTweets);

    // 4. Stats
    const { avg, median } = calcStats(originals);

    // 5. Top 3 tweets
    const top3 = [...originals].sort((a, b) => getLikes(b) - getLikes(a)).slice(0, 3);

    // 6. AI summary
    const lang = req.body.lang || 'en';
    const ai = await aiSummary(profile, originals, screen_name, lang);

    // 7. Response
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
        avg_likes: avg,
        median_likes: median,
        total_tweets_30d: allTweets.length,
      },
      ai,
      top_tweets: top3.map(t => ({
        text: (t.text || t.full_text || '').slice(0, 280),
        likes: getLikes(t),
        retweets: t.retweets || 0,
        views: t.views || '0',
        created_at: t.created_at,
      })),
    });
  } catch (e) {
    console.error('analyze error:', e);
    res.status(500).json({ error: e.message });
  }
}
