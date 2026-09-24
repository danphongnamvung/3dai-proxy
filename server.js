const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

// Bộ nhớ đệm lưu IP để tránh tra cứu DoH liên tục
let cachedIp = null;
let lastFetchTime = 0;

// Tra cứu IP của Hugging Face qua cổng HTTPS 443 (Bypass triệt để DNS Render)
async function getHuggingFaceIp() {
  if (cachedIp && (Date.now() - lastFetchTime < 600000)) { // Cache trong 10 phút
    return cachedIp;
  }

  try {
    const res = await axios.get('https://cloudflare-dns.com/dns-query?name=api-inference.huggingface.co&type=A', {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 5000
    });

    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      cachedIp = res.data.Answer.find(a => a.type === 1)?.data || res.data.Answer[0].data;
      lastFetchTime = Date.now();
      console.log(`[DoH Success] IP Hugging Face: ${cachedIp}`);
      return cachedIp;
    }
  } catch (e) {
    console.error('[DoH Error] Không thể lấy IP qua DoH:', e.message);
  }
  return null;
}

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const resolvedIp = await getHuggingFaceIp();

    // Ép Axios kết nối trực tiếp tới IP đã phân giải qua DoH
    const agentOptions = { keepAlive: true };
    if (resolvedIp) {
      agentOptions.lookup = (hostname, options, cb) => {
        if (hostname === 'api-inference.huggingface.co') {
          return cb(null, resolvedIp, 4);
        }
        require('dns').lookup(hostname, options, cb);
      };
    }

    const httpsAgent = new https.Agent(agentOptions);

    const hfResponse = await axios.post(
      'https://api-inference.huggingface.co/models/openai/shap-e',
      req.body,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        httpsAgent: httpsAgent,
        responseType: 'arraybuffer',
        timeout: 120000 // Chờ tối đa 120 giây
      }
    );

    res.setHeader('Content-Type', hfResponse.headers['content-type'] || 'application/octet-stream');
    return res.status(hfResponse.status).send(Buffer.from(hfResponse.data));

  } catch (err) {
    if (err.response) {
      res.setHeader('Content-Type', err.response.headers['content-type'] || 'application/json');
      return res.status(err.response.status).send(err.response.data);
    }
    
    return res.status(500).json({ error: `Proxy Error: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
