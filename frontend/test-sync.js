fetch('https://growthomic.vercel.app/api/sync-customers')
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
