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

   TWITCH_CLIENT_ID=your_twitch_app_client_id
   TWITCH_CLIENT_SECRET=your_twitch_app_client_secret
   TWITCH_ACCESS_TOKEN=your_twitch_user_access_token
   TWITCH_REFRESH_TOKEN=your_twitch_user_refresh_token
   TWITCH_BROADCASTER_LOGIN=tomthinks

   ADMIN_PASSWORD=some_password_of_your_choosing
   ```

   - `PATREON_ACCESS_TOKEN` — a Patreon API v2 creator's access token for your
     campaign. Generate one from your client on the
     [Patreon Platform dashboard](https://www.patreon.com/portal/registration/register-clients).
   - `PATREON_CAMPAIGN_ID` — the numeric ID of your Patreon campaign.
   - `PORT` — optional, defaults to `3002` if omitted.
   - `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` — from a Twitch application
     you register at the
     [Twitch Developer Console](https://dev.twitch.tv/console/apps).
   - `TWITCH_ACCESS_TOKEN` / `TWITCH_REFRESH_TOKEN` — a **user** OAuth token
     for the `tomthinks` broadcaster account (not an app token), authorized
     with the `channel:read:subscriptions` scope. Get one by running your
     app's client ID through the
     [OAuth authorization code flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow)
     with that scope, or a token generator tool, while logged in as
     `tomthinks`. The server automatically refreshes this token as needed and
     rewrites the new values back into `.env`, since Twitch rotates the
     refresh token every time it's used.
   - `TWITCH_BROADCASTER_LOGIN` — optional, defaults to `tomthinks` if
     omitted.
   - `ADMIN_PASSWORD` — password required to log into the admin UI at `/` and
     use the **Update Sub Data** button. Until this is set, logins are
     rejected and the admin page is unusable.

   `.env` is gitignored and should never be committed — it holds your secret
   tokens. `.env.example` is the checked-in template showing which variables
   are required.

4. Start the server:

   ```
   node index.js
   ```

5. Fetch the generated patron/subscriber lists (these two are always computed
   live from the APIs on request):

   ```
   curl http://localhost:3002/patreon-data.txt
   curl http://localhost:3002/twitch-data.txt
   ```

6. Open the admin UI at `http://localhost:3002/`, log in with
   `ADMIN_PASSWORD`, and click **Update Sub Data**. This calls both APIs,
   formats the combined list the same way `/subs.txt` has always looked, and
   writes it to `data/subs.txt` on disk.

   `/subs.txt` itself just serves that static file — it is **not**
   recomputed on every request, only when the button is clicked. Until the
   button has been clicked at least once, `/subs.txt` responds with a `404`.

## Notes

- If `PATREON_ACCESS_TOKEN` or `PATREON_CAMPAIGN_ID` is missing, the app will
  throw an error on startup telling you to fill in `.env`.
- If the Twitch variables are missing, the app still starts and
  `/patreon-data.txt` still works — `/twitch-data.txt` will just respond with
  `503` until Twitch is configured.
- Tier-to-placeholder mappings live in `patreonSubLevelMap` (Patreon tier IDs)
  and `twitchTierMap` (Twitch tiers `1000`/`2000`/`3000`) in `index.js` —
  update these if tiers change.
- `data/subs.txt` is gitignored, same as `.env` — it holds real
  subscriber/patron names and is regenerated locally, not committed.
