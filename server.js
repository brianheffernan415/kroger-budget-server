const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/token', async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;
    const creds = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const r = await fetch('https://api.kroger.com/v1/connect/oauth2/token', {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=product.compact'
    });
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/search', async (req, res) => {
  try {
    const { token, query, locationId } = req.body;
    const loc = locationId ? '&filter.locationId=' + encodeURIComponent(locationId) : '';
    const r = await fetch(`https://api.kroger.com/v1/products?filter.term=${encodeURIComponent(query)}&filter.limit=10${loc}`, {
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
    });
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
