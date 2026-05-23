export default function handler(req, res) {
  res.status(200).json({
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: req.body || null
  });
}
