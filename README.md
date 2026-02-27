# Creator Profile Analyzer

Chrome extension that analyzes Twitter/X creator profiles with one click — shows follower stats, 30-day tweet analytics, and AI-generated summary in a Side Panel.

## Features

- **One-click analysis** on any x.com profile page
- **AI Summary** with content category, creator portrait, and collaboration value assessment
- **30-day stats**: original post count, avg likes, median likes
- **Top 3 tweets** by engagement
- **Chinese/English toggle** for AI summary language
- **Side Panel UI** — doesn't block the page

## Architecture

```
Chrome Extension (Manifest V3)
├── Content Script — injects "Analyze" button on x.com profiles
├── Side Panel — displays profile card with stats + AI summary
└── Background Service Worker — relays API calls

Vercel API (/api/analyze)
├── TikHub API — fetches Twitter profile + 30-day tweets
├── OpenRouter (Claude Haiku) — generates AI summary
└── Returns unified JSON response
```

## Install Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

## Usage

**Method 1: On x.com profile page**
- Visit any profile (e.g. `https://x.com/clairevo`)
- Click the blue **Analyze** button next to the username
- Side Panel opens automatically with results

**Method 2: Manual input**
- Click the extension icon in toolbar to open Side Panel
- Type `@username` in the search bar, press Enter or click Analyze

**Language Toggle**
- Click **EN** / **CN** buttons below the search bar
- EN = English AI summary, CN = Chinese AI summary
- UI labels switch instantly; click Analyze again for new language summary

## Settings

Click **Settings** at the bottom of the Side Panel:
- **Auth Token**: optional bearer token for API authentication

## API Endpoint

`POST /api/analyze`

Request:
```json
{ "screen_name": "clairevo", "lang": "zh" }
```

Response:
```json
{
  "profile": { "name", "avatar", "followers", "desc", "location", "verified" },
  "stats": { "original_posts", "total_tweets_30d", "avg_likes", "median_likes" },
  "ai": { "category", "summary", "tags" },
  "top_tweets": [{ "text", "likes", "retweets", "views" }]
}
```

## Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `TIKHUB_TOKEN` | TikHub API bearer token |
| `OPENROUTER_API_KEY` | OpenRouter API key for Claude Haiku |
| `GOOGLE_SERVICE_ACCOUNT` | Google Sheets service account JSON |
| `EXTENSION_AUTH_TOKEN` | Optional auth token for API protection |

## Deploy

```bash
vc-work deploy --prod
```

## Tech Stack

- Chrome Extension Manifest V3 + Side Panel API
- Vercel Serverless Functions (Node.js)
- TikHub API (Twitter data)
- OpenRouter / Claude Haiku (AI summary)
