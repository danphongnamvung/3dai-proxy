const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dns = require('dns');

// Ép Node.js ưu tiên phân giải tên miền qua IPv4 (Sửa triệt để lỗi ENOTFOUND trên Render)
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors());

// Nhận dữ liệu ảnh thô từ SketchUp (tối đa 20MB)
app.use(express.raw({ type: '*/*', limit: '20mb' }));

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';

    const hfResponse = await axios.post(
      'https://api-inference.huggingface.co/models/openai/shap-e',
      req.body,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
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
