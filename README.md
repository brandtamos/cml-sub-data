# cml-sub-data

Node app that pulls Patreon (and Twitch) subscriber data and serves it as a
plain text file for consumption by other services.

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Create your own `.env` file by copying the provided example:

   ```
   cp .env.example .env
   ```

3. Fill in your values in `.env`:

   ```
   PATREON_ACCESS_TOKEN=your_patreon_api_v2_access_token
   PATREON_CAMPAIGN_ID=your_patreon_campaign_id
   PORT=3002
   ```

   - `PATREON_ACCESS_TOKEN` — a Patreon API v2 creator's access token for your
     campaign. Generate one from your client on the
     [Patreon Platform dashboard](https://www.patreon.com/portal/registration/register-clients).
   - `PATREON_CAMPAIGN_ID` — the numeric ID of your Patreon campaign.
   - `PORT` — optional, defaults to `3002` if omitted.

   `.env` is gitignored and should never be committed — it holds your secret
   access token. `.env.example` is the checked-in template showing which
   variables are required.

4. Start the server:

   ```
   node index.js
   ```

5. Fetch the generated patron list:

   ```
   curl http://localhost:3002/patreon-data.txt
   ```

## Notes

- If `PATREON_ACCESS_TOKEN` or `PATREON_CAMPAIGN_ID` is missing, the app will
  throw an error on startup telling you to fill in `.env`.
- Tier-to-placeholder mappings live in `patreonSubLevelMap` in `index.js` and
  are keyed by Patreon tier ID — update this if tiers change.
