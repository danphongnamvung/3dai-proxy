const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

// Nhận dữ liệu ảnh thô từ SketchUp (tối đa 20MB)
app.use(express.raw({ type: '*/*', limit: '20mb' }));

app.post('/proxy', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';

    // Dùng Axios gửi binary qua Hugging Face với Timeout 2 phút
    const hfResponse = await axios.post(
      'https://api-inference.huggingface.co/models/openai/shap-e',
      req.body,
      {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'image/jpeg'
        },
        responseType: 'arraybuffer',
        timeout: 120000 // Chờ tối đa 120 giây
      }
    );

    res.setHeader('Content-Type', hfResponse.headers['content-type'] || 'application/octet-stream');
    return res.status(hfResponse.status).send(Buffer.from(hfResponse.data));

  } catch (err) {
    if (err.response) {
      // Trả lại nguyên vẹn mã lỗi (vd: 503 khi AI đang ngủ) từ Hugging Face về cho SketchUp
      res.setHeader('Content-Type', err.response.headers['content-type'] || 'application/json');
      return res.status(err.response.status).send(err.response.data);
    }
    
    return res.status(500).json({ error: `Proxy Error: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
