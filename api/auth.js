export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverUrl, username, password } = req.body;
  if (!serverUrl || !username || !password) {
    return res.status(400).json({ error: 'Missing serverUrl, username, or password' });
  }

  try {
    const url = serverUrl.startsWith('http') ? serverUrl : `https://${serverUrl}`;
    const response = await fetch(`${url}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'credentials', username, password }),
    });

    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Auth request failed' });
  }
}
