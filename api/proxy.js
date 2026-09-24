export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers['authorization'] || '';

    // Gom toàn bộ dữ liệu ảnh Binary từ SketchUp vào Buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const imageBuffer = Buffer.concat(chunks);

    // Chuyển tiếp sang Hugging Face
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/openai/shap-e', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'image/jpeg',
      },
      body: imageBuffer,
    });

    const arrayBuffer = await hfResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', hfResponse.headers.get('content-type') || 'application/octet-stream');
    return res.status(hfResponse.status).send(buffer);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
