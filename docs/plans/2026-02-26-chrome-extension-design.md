# Creator Profile Chrome Extension Design

## Overview
Chrome extension that adds a "Analyze" button on x.com user profile pages. Clicking it opens a Side Panel showing a complete creator profile card with stats and AI-generated summary.

## Architecture

### Chrome Extension (Manifest V3)
- **Content Script**: Injected on x.com. Detects current screen_name from URL/page. Adds an "Analyze" button near the profile header.
- **Side Panel**: Renders the creator profile card. Shows loading state while data is fetched.
- **Background Service Worker**: Relays messages between content script and Vercel API.

### Vercel API (existing creator-review-v2 project)
- **POST /api/analyze**: Accepts `{ screen_name }`, returns complete profile JSON.
  - Calls TikHub `fetch_user_profile` for bio/followers/avatar
  - Calls TikHub `fetch_user_post_tweets` with pagination for 30-day tweets
  - Filters to original tweets (conversation_id === tweet_id)
  - Calculates avg likes, median likes, post count
  - Picks top 3 tweets by likes
  - Calls Claude API (Haiku) with tweet texts to generate: content category, one-paragraph summary, collaboration value assessment
  - Returns unified JSON response

### Data Flow
```
User clicks button on x.com profile page
  -> Content Script sends screen_name to Service Worker
  -> Service Worker calls POST /api/analyze
  -> Vercel: TikHub profile + tweets -> Claude summary -> JSON response
  -> Side Panel renders profile card
```

## Profile Card Contents
- Avatar, name, handle, follower count, verified badge
- 30-day stats: original tweet count, avg likes, median likes
- Content category tag (AI Agent / General / Tech / etc)
- AI summary paragraph: who they are, content focus, collaboration value
- Top 3 tweets preview (text + likes count)

## Tech Stack
- Chrome Extension: Manifest V3, Side Panel API (Chrome 114+)
- Server: Vercel serverless (existing project), Node.js
- APIs: TikHub (Twitter data), Claude Haiku (AI summary)
- Auth: Simple bearer token in extension config to prevent abuse

## API Keys
- TikHub token and Claude API key stored as Vercel environment variables
- Extension sends a simple auth token (stored in chrome.storage) to verify requests
