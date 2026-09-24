export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60, // Tăng thời gian chờ Serverless lên tối đa cho Vercel
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

    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBuffer = Buffer.concat(chunks);
    const uint8Data = new Uint8Array(rawBuffer);

    // Gửi request tới Hugging Face kèm User-Agent chuẩn
    const hfResponse = await fetch('https://api-inference.huggingface.co/models/openai/shap-e', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'image/jpeg',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: uint8Data,
      duplex: 'half'
    });

    if (!hfResponse.ok) {
      const errText = await hfResponse.text();
      return res.status(hfResponse.status).send(`HuggingFace Err: ${errText}`);
    }

    const resArrayBuffer = await hfResponse.arrayBuffer();
    const resBuffer = Buffer.from(resArrayBuffer);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', hfResponse.headers.get('content-type') || 'application/octet-stream');
    return res.status(200).send(resBuffer);

  } catch (error) {
    return res.status(500).json({ error: `Fetch failed: ${error.message}` });
  }
}
