export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  // Only proxy ftrack URLs
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('.ftrackapp.com') && !host.endsWith('.ftrack.com')) {
      return res.status(403).send('Forbidden');
    }
  } catch {
    return res.status(400).send('Invalid URL');
  }

  try {
    const upstream = await fetch(url, { redirect: 'follow' });
    if (!upstream.ok) return res.status(upstream.status).send('Upstream error');

    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Allow range requests for video seeking
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buffer);
  } catch {
    res.status(502).send('Proxy error');
  }
}
