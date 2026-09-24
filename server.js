const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

let cachedIp = null;
let lastFetchTime = 0;

// Tra cứu IP bằng HTTPS bắn THẲNG VÀO IP (1.1.1.1 / 8.8.8.8) để tránh tra cứu DNS tên miền
async function getHuggingFaceIp() {
  if (cachedIp && (Date.now() - lastFetchTime < 600000)) {
    return cachedIp;
  }

  const agentNoCheck = new https.Agent({ rejectUnauthorized: false });

  // 1. Truy vấn DoH trực tiếp bằng IP 1.1.1.1
  try {
    const res = await axios.get('https://1.1.1.1/dns-query?name=api-inference.huggingface.co&type=A', {
      headers: { 'Accept': 'application/dns-json', 'Host': 'cloudflare-dns.com' },
      httpsAgent: agentNoCheck,
      timeout: 5000
    });
    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      const ip = res.data.Answer.find(a => a.type === 1)?.data;
      if (ip) {
        cachedIp = ip;
        lastFetchTime = Date.now();
        console.log(`[DoH 1.1.1.1 OK] IP Hugging Face: ${ip}`);
        return cachedIp;
      }
    }
  } catch (e) {
    console.log('DoH 1.1.1.1 failed:', e.message);
  }

  // 2. Dự phòng truy vấn DoH bằng IP 8.8.8.8
  try {
    const res = await axios.get('https://8.8.8.8/resolve?name=api-inference.huggingface.co&type=A', {
      headers: { 'Host': 'dns.google' },
      httpsAgent: agentNoCheck,
      timeout: 5000
    });
    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      const ip = res.data.Answer.find(a => a.type === 1)?.data;
      if (ip) {
        cachedIp = ip;
        lastFetchTime = Date.now();
        console.log(`[DoH 8.8.8.8 OK] IP Hugging Face: ${ip}`);
        return cachedIp;
      }
    }
  } catch (e) {
    console.log('DoH 8.8.8.8 failed:', e.message);
  }

  return cachedIp;
}

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const ip = await getHuggingFaceIp();

    if (!ip) {
      return res.status(500).json({ error: "Proxy Error: Render DNS bị chặn hoàn toàn, không thể lấy IP của Hugging Face." });
    }

    const targetUrl = `https://${ip}/models/openai/shap-e`;

    const hfResponse = await axios.post(
      targetUrl,
      req.body,
      {
        headers: {
          'Host': 'api-inference.huggingface.co',
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        httpsAgent: new https.Agent({
          servername: 'api-inference.huggingface.co',
          rejectUnauthorized: false
        }),
        responseType: 'arraybuffer',
        timeout: 120000
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
