const assert = require('assert');
const { App } = require('@slack/bolt');
const axios = require('axios').default;

assert(process.env.SLACK_BOT_TOKEN);
assert(process.env.SLACK_SIGNING_SECRET);
assert(process.env.CRUX_API_KEY);
assert(process.env.ORIGIN);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const metricsMap = {
  LCP: 'largest_contentful_paint',
  CLS: 'cumulative_layout_shift',
  FID: 'first_input_delay',
  TTFB: 'experimental_time_to_first_byte',
  FCP: 'first_contentful_paint',
  INP: 'experimental_interaction_to_next_paint',
};

app.message(/^srux/, async ({ message, say }) => {
  const [dirtyAcronym, url] = message.text.split(' ').slice(1);
  if (!dirtyAcronym) {
    return;
  }

  const acronym = dirtyAcronym.toUpperCase();

  const metric = metricsMap[acronym];
  if (!metric) {
    return;
  }

  say('Loading...');

  const sanitizedUrl = url ? url.replace('<', '').replace('>', '') : ''; // <https://example.com> -> https://example.com
  const params = sanitizedUrl ? { url: sanitizedUrl } : { origin: process.env.ORIGIN };
  const resp = await axios.post(
    `https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord?key=${process.env.CRUX_API_KEY}`,
    {
      ...params,
      formFactor: 'PHONE',
      metrics: [metric],
    }
  );

  const graphData = {
    type: 'line',
    data: {
      labels: resp.data.record.collectionPeriods.map((p) => `${p.lastDate.month}/${p.lastDate.day}`),
      datasets: [
        {
          label: acronym,
          data: resp.data.record.metrics[metric].percentilesTimeseries.p75s,
          fill: false,
          borderColor: 'blue',
        },
      ],
    },
  };

  await say({
    text: `*${sanitizedUrl || process.env.SITE_NAME || process.env.ORIGIN} ${acronym}*`,
    attachments: [
      {
        color: '#81848f',
        blocks: [
          {
            type: 'image',
            image_url: `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(graphData))}`,
            alt_text: `${acronym}`,
          },
        ],
      },
    ],
  });
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt app is running!');
})();
