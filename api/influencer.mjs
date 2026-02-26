import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = '18bb7WwvtxUmR29mzGNkqJx024zFo_xlE2zCIa6bTTVY';
const SHEET_GID = 1482963763; // Influencers

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
    const influencers = rows.map(r => ({
      name: r.get('Name') || '',
      followers: r.get('# of Followers') || '',
      profile: r.get('Link to their profile') || '',
      highlight_post: r.get('Link to their highlight post') || '',
      highlight_likes: r.get('# of Highlight post likes') || '',
      avg_likes: r.get('Ave. likes (last month)') || '',
      median_likes: r.get('Median likes (原创 within a month)') || '',
      demi_approve: r.get('Demi approve') || '',
      notes: r.get('Notes') || ''
    })).filter(c => c.profile);
    res.json(influencers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
