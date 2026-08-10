fetch('https://growthomic.vercel.app/api/test-keys')
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
