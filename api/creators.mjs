import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = '11Jjx5pc057nQ8Di1siBafEqMSQ3ZKa3xY2wMLfNubCs';
const SHEET_GID = 161759129; // Back up of Twitter Tech Creators

async function getSheet() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new JWT({ email: creds.client_email, key: creds.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const doc = new GoogleSpreadsheet(SHEET_ID, auth);
  await doc.loadInfo();
  const sheet = doc.sheetsById[SHEET_GID];
  return sheet;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheet = await getSheet();
    const rows = await sheet.getRows();

    if (req.method === 'POST') {
      const { handle, picked, rejected } = req.body;
      const row = rows.find(r => r.get('Creator Handle')?.toLowerCase() === handle?.toLowerCase());
      if (row) {
        if (rejected) {
          row.set('Picked', 'REJECTED');
          row.set('Picked At', new Date().toISOString());
        } else {
          row.set('Picked', picked ? 'YES' : '');
          row.set('Picked At', picked ? new Date().toISOString() : '');
        }
        await row.save();
        return res.json({ ok: true, handle, picked, rejected });
      }
      return res.status(404).json({ error: 'not found' });
    }

    // GET - return all creators
    const creators = rows.map(r => ({
      handle: r.get('Creator Handle') || '',
      community_paid: r.get('Community/Paid') || '',
      category: r.get('Category') || '',
      selection_status: r.get('Selection Status') || '',
      demi: r.get('Demi') || '',
      tier: r.get('Tier') || '',
      name: r.get('Name') || '',
      bio: r.get('Bio') || '',
      risk_flag: r.get('Risk Flag') || '',
      risk_assessment: r.get('Risk Assessment') || '',
      recommendation: r.get('Recommendation') || '',
      recommendation_reason: r.get('Recommendation Reason') || '',
      ex1_url: r.get('Ex1 URL') || '',
      ex1_views: r.get('Ex1 Views') || '',
      ex1_likes: r.get('Ex1 Likes') || '',
      ex1_topic: r.get('Ex1 Topic, agent, AI Chat, "anthropic, claude, agent", claude, "claude, agent", moltbot, "moltbook, agent"') || '',
      est_cpm: r.get('Est. CPM') || '',
      max_pay: r.get('Max Pay') || '',
      median_views: r.get('Median Views') || '',
      median_likes: r.get('Median Likes') || '',
      notes: r.get('Notes') || '',
      top_post_url: r.get('Top Post (Last Month)') || '',
      top_post_likes: r.get('Top Post Likes (Last Month)') || '',
      picked: r.get('Picked') === 'YES',
      rejected: r.get('Picked') === 'REJECTED'
    }));
    res.json(creators);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
