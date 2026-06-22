const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
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

app.post('/scan-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    const key = process.env.GOOGLE_VISION_KEY;
    const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
        }]
      })
    });
    const d = await r.json();
    const text = d.responses && d.responses[0] && d.responses[0].fullTextAnnotation
      ? d.responses[0].fullTextAnnotation.text
      : '';

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const skipWords = ['save for later', 'in cart', 'snap ebt', 'backup', 'best available',
      'choose backup', 'continue to checkout', 'view offer', 'coupon', 'new look',
      'view items', 'estimated total', 'cart', 'shop', 'save', 'health', 'checkout'];

    const isSkip = line => {
      const lower = line.toLowerCase();
      if(skipWords.some(w => lower.includes(w))) return true;
      if(lower.match(/^\d+\s*(oz|lb|ct|ml|g|kg|fl oz)/i)) return true;
      if(lower.match(/^[\d\s\$\.\+\-\×x]+$/)) return true;
      if(line.length < 3) return true;
      return false;
    };

    const isProductName = line => {
      if(isSkip(line)) return false;
      if(line.match(/^\$/)) return false;
      if(line.match(/^\d+$/)) return false;
      return true;
    };

    // Reconstruct lines — Kroger big price font splits "$1" and "25" onto separate tokens
    // Join adjacent short numeric lines that look like split prices
    const joined = [];
    for(let i = 0; i < lines.length; i++) {
      const cur = lines[i];
      const next = lines[i+1] || '';
      // Pattern: "$1" followed by "25" => "$1.25"
      if(cur.match(/^\$\d+$/) && next.match(/^\d{2}$/)) {
        joined.push(cur + '.' + next);
        i++; // skip next
      }
      // Pattern: "$3.19" with strikethrough duplicate like "$3.69" right after
      else if(cur.match(/^\$\d+\.\d{2}$/) && next.match(/^\$\d+\.\d{2}$/)) {
        joined.push(cur); // take the first (sale) price, skip the crossed-out one
        i++;
      }
      else {
        joined.push(cur);
      }
    }

    const items = [];
    for(let i = 0; i < joined.length; i++) {
      const line = joined[i];
      const priceMatch = line.match(/^\$(\d+\.\d{2})$/);
      if(priceMatch) {
        const price = parseFloat(priceMatch[1]);
        // Look forward for the product name
        for(let j = i+1; j < Math.min(i+5, joined.length); j++) {
          if(isProductName(joined[j])) {
            items.push({ name: joined[j].replace('®','').replace('™','').trim(), price });
            break;
          }
        }
      }
    }

    // Remove duplicates
    const seen = new Set();
    const unique = items.filter(item => {
      if(seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });

    res.json({ items: unique, rawText: text });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
