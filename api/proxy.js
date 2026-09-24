export const config = {
  api: {
    bodyParser: false, // Giữ nguyên dữ liệu Binary của ảnh từ SketchUp
  },
};

export default async function handler(req, res) {
  // 1. Xử lý CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers['authorization'] || '';

    // 2. Chuyển tiếp request sang Hugging Face
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/openai/shap-e', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'image/jpeg',
      },
      body: req,
    });

    // 3. Đọc dữ liệu trả về và gửi lại SketchUp
    const arrayBuffer = await hfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', hfResponse.headers.get('content-type') || 'application/octet-stream');
    return res.status(hfResponse.status).send(buffer);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
