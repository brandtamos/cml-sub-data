require('dotenv').config();
const axios = require('axios');
const express = require('express');

// Patreon API v2 credentials — configured via .env (see .env.example)
const accessToken = process.env.PATREON_ACCESS_TOKEN;
const campaignId = process.env.PATREON_CAMPAIGN_ID;

if (!accessToken || !campaignId) {
  throw new Error(
    'Missing PATREON_ACCESS_TOKEN or PATREON_CAMPAIGN_ID. Copy .env.example to .env and fill in your values.'
  );
}

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

  //sorts the patron list alphabetically by name
  function patreonPledgeSort(obj1, obj2){
    if(obj1.name > obj2.name) return 1;
    if(obj1.name < obj2.name) return -1;
    return 0;
  }

  app.get('/patreon-data.txt', async (req, res) => {
    try {
      fetchPatrons()
        .then(data => {
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

                  //build the formatted pledge string and add to the array
                  let pledgeParts = {pledgeCode: patreonSubLevelMap.get(tierId) || '', name: fullName};
                  pledgeStringParts.push(pledgeParts);
              }
          });
          pledgeStringParts.sort(patreonPledgeSort);
          let formattedPledgeString = '';
          pledgeStringParts.forEach(pledgeStringPart => {
              formattedPledgeString += pledgeStringPart.pledgeCode + pledgeStringPart.name + '\r\n';
          });
          formattedPledgeString = formattedPledgeString.substring(0, formattedPledgeString.length - 2);

          res.set('Content-Type', 'text/plain');
          res.send(formattedPledgeString);
        })
        .catch(error => {
          console.error('Failed to fetch patrons:', error);
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

  //start webserver
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
