import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = '18bb7WwvtxUmR29mzGNkqJx024zFo_xlE2zCIa6bTTVY';
const SHEET_GID = 753894421; // Community Creators

async function getSheet() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();
  return doc.sheetsById[SHEET_GID];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();
    const creators = rows.map(r => ({
      name: r.get('Name') || '',
      followers: r.get('# of Followers') || '',
      profile: r.get('Link to their profile') || '',
      highlight_post: r.get('Link to their highlight post') || '',
      highlight_likes: r.get('# of Highlight post likes') || '',
      avg_likes: r.get('# of Ave. likes (last month)') || '',
      median_likes: r.get('# of Medium likes') || '',
      posts_count: r.get('# of Posts (last month)') || ''
    })).filter(c => c.profile);
    res.json(creators);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
