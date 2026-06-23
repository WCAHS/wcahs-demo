import { json, error } from '../_helpers.js';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const SITE_TAG = 'b6430a52ad0c4e268bdde55586d61542';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '7d';

  const now = new Date();
  let start;
  switch (range) {
    case '24h': start = new Date(now - 24 * 60 * 60 * 1000); break;
    case '30d': start = new Date(now - 30 * 24 * 60 * 60 * 1000); break;
    default:    start = new Date(now - 7 * 24 * 60 * 60 * 1000); break;
  }

  const startDate = start.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${env.CLOUDFLARE_ACCOUNT_ID || '2e6f341d7f6ccedcea8681b5953c9489'}" }) {
        rumPageloadEventsAdaptiveGroups(
          filter: { AND: [
            { siteTag: "${SITE_TAG}" },
            { date_geq: "${startDate}" },
            { date_leq: "${endDate}" }
          ]},
          limit: 5000
        ) {
          count
          dimensions { date, requestPath, refererHost, countryName, userAgentBrowser, deviceType }
          sum { visits }
        }
      }
    }
  }`;

  try {
    const apiToken = env.CF_ANALYTICS_TOKEN || env.CLOUDFLARE_API_TOKEN_ANALYTICS;
    if (!apiToken) return error('Analytics token not configured');

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();

    if (!data.data) {
      return json({ error: 'GraphQL error', details: data.errors || [] });
    }

    const rows = data.data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups || [];

    // Aggregate totals
    let totalViews = 0, totalVisits = 0;
    const byDate = {}, byPath = {}, byReferer = {}, byCountry = {}, byBrowser = {}, byDevice = {};

    for (const row of rows) {
      const d = row.dimensions;
      totalViews += row.count;
      totalVisits += row.sum.visits;

      byDate[d.date] = (byDate[d.date] || 0) + row.count;
      if (d.requestPath) byPath[d.requestPath] = (byPath[d.requestPath] || 0) + row.count;
      if (d.refererHost) byReferer[d.refererHost] = (byReferer[d.refererHost] || 0) + row.count;
      if (d.countryName) byCountry[d.countryName] = (byCountry[d.countryName] || 0) + row.count;
      if (d.userAgentBrowser) byBrowser[d.userAgentBrowser] = (byBrowser[d.userAgentBrowser] || 0) + row.count;
      if (d.deviceType) byDevice[d.deviceType] = (byDevice[d.deviceType] || 0) + row.count;
    }

    const sortDesc = (obj, limit = 10) =>
      Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));

    return json({
      range,
      totalViews,
      totalVisits,
      byDate: Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      topPages: sortDesc(byPath),
      topReferrers: sortDesc(byReferer),
      topCountries: sortDesc(byCountry),
      topBrowsers: sortDesc(byBrowser),
      devices: sortDesc(byDevice),
    });
  } catch (e) {
    return error('Failed to fetch analytics: ' + e.message);
  }
}
