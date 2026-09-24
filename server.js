const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const dns = require('dns');

// Ép Node.js ưu tiên IPv4 (Khắc phục lỗi ENOTFOUND trên môi trường Linux/Render)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

// Danh sách IP Anycast cố định của Cloudflare phục vụ Hugging Face (Bypass DNS 100%)
const HARDCODED_HF_IPS = [
  '104.18.28.122',
  '104.18.29.122',
  '172.67.160.108',
  '104.18.30.122'
];

async function getHuggingFaceIp() {
  // 1. Thử lấy IP động qua Google DoH API (Dùng tên miền HTTPS tiêu chuẩn)
  try {
    const res = await axios.get('https://dns.google/resolve?name=api-inference.huggingface.co&type=A', { 
      timeout: 3000 
    });
    if (res.data && res.data.Answer && res.data.Answer.length > 0) {
      const ip = res.data.Answer.find(a => a.type === 1)?.data;
      if (ip) {
        console.log(`[Google DoH OK] IP: ${ip}`);
        return ip;
      }
    }
  } catch (e) {
    console.log('[Google DoH Failed] Chuyển sang danh sách IP Anycast dự phòng...');
  }

  // 2. Nếu DNS thất bại, chọn ngẫu nhiên 1 IP trong danh sách Hardcoded Anycast IPs
  const fallbackIp = HARDCODED_HF_IPS[Math.floor(Math.random() * HARDCODED_HF_IPS.length)];
  console.log(`[Fallback Anycast IP] Sử dụng IP: ${fallbackIp}`);
  return fallbackIp;
}

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const ip = await getHuggingFaceIp();

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
