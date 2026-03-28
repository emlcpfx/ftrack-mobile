import { addSubscription, removeSubscription } from './lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, subscription } = req.body;

  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Missing subscription' });
  }

  if (action === 'unsubscribe') {
    removeSubscription(subscription.endpoint);
    return res.status(200).json({ ok: true, action: 'unsubscribed' });
  }

  // Default: subscribe
  addSubscription(subscription);
  return res.status(200).json({ ok: true, action: 'subscribed' });
}
