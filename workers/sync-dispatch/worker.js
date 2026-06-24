export default {
  async scheduled(event, env) {
    await fetch('https://api.github.com/repos/WCAHS/wcahs-demo/actions/workflows/shelterluv-sync.yml/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.GH_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'WCAHS-Sync-Trigger',
      },
      body: JSON.stringify({ ref: 'master' }),
    });
  }
};
