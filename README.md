# Creator Review v2

Pika creator sourcing review tool.

## Setup
- **Vercel Project**: `creator-review-v2`
- **URL**: https://creator-review-v2.vercel.app
- **Service Account**: `429813347488-compute@developer.gserviceaccount.com`
- **Service Account Key**: `~/clawd/.google-service-account.json`
- **Vercel Env Var**: `GOOGLE_SERVICE_ACCOUNT` (contains the full JSON key)

## Data Source
- **Spreadsheet**: Nova 3.0 Creator Sourcing List (`11Jjx5pc057nQ8Di1siBafEqMSQ3ZKa3xY2wMLfNubCs`)
- **Sheet**: "Back up of Twitter Tech Creators" (gid=161759129)
- **Picked column**: AF (Picked), AG (Picked At)

## Deploy
```bash
cd ~/projects/creator-review-v2
source ~/.nvm/nvm.sh && source ~/clawd/.env
vercel deploy --prod --token "$VERCEL_TOKEN"
```
