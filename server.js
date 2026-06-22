const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/nutrition', async (req, res) => {
  try {
    const { query } = req.body;
    const key = process.env.USDA_API_KEY;
    const r = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=5&api_key=${key}`);
    const d = await r.json();
    const results = (d.foods || []).map(f => {
      const nutrients = f.foodNutrients || [];
      const get = name => {
        const n = nutrients.find(x => x.nutrientName && x.nutrientName.toLowerCase().includes(name));
        return n ? Math.round(n.value * 10) / 10 : null;
      };
      return {
        id: f.fdcId,
        name: f.description,
        brand: f.brandOwner || '',
        calories: get('energy'),
        protein: get('protein'),
        carbs: get('carbohydrate'),
        fat: get('total lipid')
      };
    });
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
