export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // 1. Cấu hình CORS cho SketchUp
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    return res.status(200).end();
  }

  try {
    const authHeader = req.headers['authorization'] || '';

    // 2. Gom dữ liệu binary ảnh và ép kiểu sang Uint8Array
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBuffer = Buffer.concat(chunks);
    const uint8Data = new Uint8Array(rawBuffer);

    // 3. Gửi sang Hugging Face với tham số duplex: 'half'
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/openai/shap-e', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'image/jpeg',
      },
      body: uint8Data,
      duplex: 'half' // SỬA LỖI: Bắt buộc đối với Node.js 18+ Fetch
    });

    const resArrayBuffer = await hfResponse.arrayBuffer();
    const resBuffer = Buffer.from(resArrayBuffer);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', hfResponse.headers.get('content-type') || 'application/octet-stream');
    return res.status(hfResponse.status).send(resBuffer);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
