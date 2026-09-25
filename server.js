const express = require('express');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const dns = require('dns');

const app = express();
app.use(cors());
app.use(express.raw({ type: '*/*', limit: '20mb' }));

// 1. Tạo bộ phân giải DNS độc lập (c-ares), hỏi trực tiếp Google & Cloudflare DNS
const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const FALLBACK_IPS = ['104.18.28.122', '104.18.29.122', '172.67.160.108'];

function resolveIPv4(hostname) {
  return new Promise((resolve) => {
    resolver.resolve4(hostname, (err, addresses) => {
      if (!err && addresses && addresses.length > 0) {
        return resolve(addresses[0]);
      }
      // Nếu DNS Google bị chặn UDP, dùng IP Anycast cố định của Cloudflare
      const randomIp = FALLBACK_IPS[Math.floor(Math.random() * FALLBACK_IPS.length)];
      resolve(randomIp);
    });
  });
}

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const ip = await resolveIPv4('api-inference.huggingface.co');

    // 2. Custom httpsAgent chuẩn hóa dữ liệu cho Node.js 18/20
    const customAgent = new https.Agent({
      keepAlive: true,
      lookup: (hostname, options, callback) => {
        const cb = typeof options === 'function' ? options : callback;
        const opts = typeof options === 'object' ? options : {};

        if (hostname === 'api-inference.huggingface.co') {
          // Trả về dạng Array nếu Node.js yêu cầu (options.all === true)
          if (opts.all) {
            return cb(null, [{ address: ip, family: 4 }]);
          }
          // Trả về dạng String tiêu chuẩn
          return cb(null, ip, 4);
        }

        return dns.lookup(hostname, options, callback);
      }
    });

    const hfResponse = await axios.post(
      'https://api-inference.huggingface.co/models/openai/shap-e',
      req.body,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        httpsAgent: customAgent,
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
