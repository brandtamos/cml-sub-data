require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const { RefreshingAuthProvider } = require('@twurple/auth');

// Patreon API v2 credentials — configured via .env (see .env.example)
const accessToken = process.env.PATREON_ACCESS_TOKEN;
const campaignId = process.env.PATREON_CAMPAIGN_ID;

if (!accessToken || !campaignId) {
  throw new Error(
    'Missing PATREON_ACCESS_TOKEN or PATREON_CAMPAIGN_ID. Copy .env.example to .env and fill in your values.'
  );
}

// Twitch credentials — configured via .env (see .env.example).
// Unlike Patreon, missing Twitch config only disables /twitch-data.txt rather
// than crashing the whole server, since it's a separate, independently-added feature.
const twitchClientId = process.env.TWITCH_CLIENT_ID;
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
const twitchAccessToken = process.env.TWITCH_ACCESS_TOKEN;
const twitchRefreshToken = process.env.TWITCH_REFRESH_TOKEN;
const twitchBroadcasterLogin = process.env.TWITCH_BROADCASTER_LOGIN || 'tomthinks';

//set up web server
const app = express();
const PORT = process.env.PORT || 3002; //updated to 3002, to prevent conflict with messBot

//this maps tier IDs to the placeholder tom needs for displaying the tiers next to names
const patreonSubLevelMap = new Map([
    ['8685717', ''], // BB Supporter
    ['8685729', '!2'], // 4444 Supporter
    ['8685734', '!3'], // Heart Supporter
    ['8685739', '!4'], // Champ Supporter
    ['8685756', `!5`] // Toot Power Supporter
])

//this maps Twitch subscription tiers to the same placeholder convention as patreonSubLevelMap
const twitchTierMap = new Map([
    ['1000', ''],   // Tier 1
    ['2000', '!2'], // Tier 2
    ['3000', '!3'], // Tier 3
])

//updates (or appends) key=value lines in the .env file on disk.
//needed because Twitch rotates the refresh token on every use, so the one in
//.env would go stale after the first refresh unless we persist the new one.
function updateEnvFile(updates) {
  const envPath = path.join(__dirname, '.env');
  let lines = [];
  try {
    lines = fs.readFileSync(envPath, 'utf8').split('\n');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  Object.entries(updates).forEach(([key, value]) => {
    const lineIndex = lines.findIndex(line => line.startsWith(`${key}=`));
    const newLine = `${key}=${value}`;
    if (lineIndex >= 0) {
      lines[lineIndex] = newLine;
    } else {
      lines.push(newLine);
    }
  });
  fs.writeFileSync(envPath, lines.join('\n'));
}

//lazily-initialized Twitch auth provider + resolved broadcaster user ID,
//set up once at startup by initTwitch() below
let twitchAuthProvider = null;
let twitchBroadcasterId = null;

//sets up Twitch token management using a refreshing user token for the broadcaster.
//getting a channel's subscriber list requires that broadcaster's own OAuth token
//with the channel:read:subscriptions scope — app tokens can't see this data.
//
//note: we only use @twurple/auth here for token refresh, not @twurple/api for the
//actual data call — @twurple/api pulls in an old node-fetch that throws
//ERR_STREAM_PREMATURE_CLOSE decompressing gzip responses on newer Node versions.
//The actual Helix request is made with axios instead, in fetchTwitchSubscribers().
async function initTwitch() {
  if (!twitchClientId || !twitchClientSecret || !twitchAccessToken || !twitchRefreshToken) {
    console.warn(
      'Twitch credentials not configured — /twitch-data.txt will be unavailable. ' +
      'Set TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, TWITCH_ACCESS_TOKEN, and TWITCH_REFRESH_TOKEN in .env.'
    );
    return;
  }

  try {
    const authProvider = new RefreshingAuthProvider({
      clientId: twitchClientId,
      clientSecret: twitchClientSecret,
    });

    authProvider.onRefresh((userId, newTokenData) => {
      updateEnvFile({
        TWITCH_ACCESS_TOKEN: newTokenData.accessToken,
        TWITCH_REFRESH_TOKEN: newTokenData.refreshToken,
      });
      console.log('Twitch access token refreshed and saved to .env');
    });

    //expiresIn/obtainmentTimestamp of 0 tells Twurple to treat the stored token
    //as already expired, forcing an immediate refresh rather than trusting a
    //possibly-stale lifetime read from .env
    twitchBroadcasterId = await authProvider.addUserForToken({
      accessToken: twitchAccessToken,
      refreshToken: twitchRefreshToken,
      expiresIn: 0,
      obtainmentTimestamp: 0,
      scope: ['channel:read:subscriptions'],
    });

    twitchAuthProvider = authProvider;
    console.log(`Twitch auth ready for channel "${twitchBroadcasterLogin}"`);
  } catch (error) {
    console.error('Failed to initialize Twitch auth:', error.message);
  }
}

//fetches all current subscribers to the broadcaster's channel via the Helix API
//directly (see note on initTwitch() above for why this bypasses @twurple/api)
async function fetchTwitchSubscribers() {
  if (!twitchAuthProvider || !twitchBroadcasterId) {
    throw new Error('Twitch integration is not configured.');
  }

  const { accessToken: freshAccessToken } = await twitchAuthProvider.getAccessTokenForUser(twitchBroadcasterId);

  let subscriptions = [];
  let cursor;
  do {
    const response = await axios.get('https://api.twitch.tv/helix/subscriptions', {
      params: {
        broadcaster_id: twitchBroadcasterId,
        first: 100,
        after: cursor,
      },
      headers: {
        Authorization: `Bearer ${freshAccessToken}`,
        'Client-Id': twitchClientId,
      },
    });
    subscriptions.push(...response.data.data);
    cursor = response.data.pagination && response.data.pagination.cursor;
  } while (cursor);

  return subscriptions;
}

// Function to fetch list of patrons.
// API v2 replaces the v1 "pledges" endpoint with "members", and pledge state
// moves from the v1 declined_since date field to the v2 patron_status enum.
async function fetchPatrons() {
  try {
    const response = await axios.get(
      `https://www.patreon.com/api/oauth2/v2/campaigns/${campaignId}/members?include=currently_entitled_tiers&fields%5Bmember%5D=full_name,patron_status&fields%5Btier%5D=title&page%5Bcount%5D=1000`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error('Error fetching patrons:', error.response ? error.response.data : error.message);
    throw error;
  }
}

  //sorts a {code, name} list alphabetically by name, case-insensitive
  function sortByNameCaseInsensitive(obj1, obj2){
    return obj1.name.localeCompare(obj2.name, undefined, { sensitivity: 'base' });
  }

  //fetches active patrons and returns them as a sorted, tier-coded, \r\n-joined string
  async function getFormattedPatreonSubs() {
    const data = await fetchPatrons();

    let pledgeStringParts = [];
    data.data.forEach(member => {
        //this filters out non-active patrons (v2's patron_status replaces v1's declined_since)
        if(member.attributes.patron_status === 'active_patron'){
            //grab the currently entitled tier id so we can format it as needed.
            //v2 members can hold multiple concurrent tiers, so we use the first one.
            let entitledTiers = member.relationships.currently_entitled_tiers.data;
            let tierId = entitledTiers.length > 0 ? entitledTiers[0].id : null;

            //v2 puts the patron's name directly on the member resource, no more
            //joining against a separate "included" user record like in v1
            let fullName = member.attributes.full_name;

            pledgeStringParts.push({code: patreonSubLevelMap.get(tierId) || '', name: fullName});
        }
    });
    pledgeStringParts.sort(sortByNameCaseInsensitive);

    return pledgeStringParts.map(part => part.code + part.name).join('\r\n');
  }

  //fetches current Twitch subscribers and returns them as a sorted, tier-coded, \r\n-joined string
  async function getFormattedTwitchSubs() {
    const subscriptions = await fetchTwitchSubscribers();

    let subStringParts = subscriptions.map(subscription => ({
      code: twitchTierMap.get(subscription.tier) || '',
      name: subscription.user_name,
    }));
    subStringParts.sort(sortByNameCaseInsensitive);

    return subStringParts.map(part => part.code + part.name).join('\r\n');
  }

  app.get('/patreon-data.txt', async (req, res) => {
    try {
      const formattedPledgeString = await getFormattedPatreonSubs();
      res.set('Content-Type', 'text/plain');
      res.send(formattedPledgeString);
    } catch (error) {
      console.error('Failed to fetch patrons:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
});

  app.get('/twitch-data.txt', async (req, res) => {
    if (!twitchAuthProvider || !twitchBroadcasterId) {
      res.status(503).send('Twitch integration is not configured.');
      return;
    }

    try {
      const formattedSubString = await getFormattedTwitchSubs();
      res.set('Content-Type', 'text/plain');
      res.send(formattedSubString);
    } catch (error) {
      console.error('Failed to fetch Twitch subscribers:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
});

  app.get('/subs.txt', async (req, res) => {
    try {
      const [formattedTwitchSubs, formattedPatreonSubs] = await Promise.all([
        getFormattedTwitchSubs(),
        getFormattedPatreonSubs(),
      ]);

      const formattedSubs = `[twitch subs]\r\n${formattedTwitchSubs}\r\n[patreon subs]\r\n${formattedPatreonSubs}`;

      res.set('Content-Type', 'text/plain');
      res.send(formattedSubs);
    } catch (error) {
      console.error('Failed to fetch combined subscriber data:', error);
      res.status(500).json({ error: 'Failed to fetch data' });
    }
});

  //start webserver
  initTwitch().finally(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  });
