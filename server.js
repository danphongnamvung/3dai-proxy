const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

let cachedIp = null;
let lastFetchTime = 0;

// Lấy IP của Hugging Face qua HTTPS (Google & Cloudflare DoH)
async function getHuggingFaceIp() {
  if (cachedIp && (Date.now() - lastFetchTime < 600000)) {
    return cachedIp;
  }

  // 1. Thử Cloudflare DoH
  try {
    const res = await axios.get('https://cloudflare-dns.com/dns-query?name=api-inference.huggingface.co&type=A', {
      headers: { 'Accept': 'application/dns-json' },
      timeout: 4000
    });
    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      const ip = res.data.Answer.find(a => a.type === 1)?.data;
      if (ip) {
        cachedIp = ip;
        lastFetchTime = Date.now();
        return cachedIp;
      }
    }
  } catch (e) {}

  // 2. Dự phòng bằng Google DoH
  try {
    const res = await axios.get('https://dns.google/resolve?name=api-inference.huggingface.co&type=A', {
      timeout: 4000
    });
    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      const ip = res.data.Answer.find(a => a.type === 1)?.data;
      if (ip) {
        cachedIp = ip;
        lastFetchTime = Date.now();
        return cachedIp;
      }
    }
  } catch (e) {}

  return cachedIp;
}

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const ip = await getHuggingFaceIp();

    // Nếu có IP từ DoH, gửi trực tiếp vào IP để ép Node.js không gọi getaddrinfo
    const targetUrl = ip 
      ? `https://${ip}/models/openai/shap-e` 
      : 'https://api-inference.huggingface.co/models/openai/shap-e';

    const hfResponse = await axios.post(
      targetUrl,
      req.body,
      {
        headers: {
          'Host': 'api-inference.huggingface.co', // Định danh tên miền cho máy chủ Cloudflare
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        httpsAgent: new https.Agent({
          servername: 'api-inference.huggingface.co', // Định danh SSL SNI
          keepAlive: true
        }),
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
