const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';

    const hfResponse = await fetch('https://api-inference.huggingface.co/models/openai/shap-e', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'image/jpeg',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
      body: req.body,
    });

    const arrayBuffer = await hfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', hfResponse.headers.get('content-type') || 'application/octet-stream');
    res.status(hfResponse.status).send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
