/**
 * Push notification subscription management
 *
 * Uses Vercel KV (Redis) to store push subscriptions.
 * Falls back to in-memory storage for local dev.
 *
 * POST /api/subscribe — save a push subscription
 * DELETE /api/subscribe — remove a push subscription
 * GET /api/subscribe — list subscriptions (admin, for debugging)
 */

// In-memory fallback for local dev / when KV not configured
const memStore = new Map();

async function getKv() {
  try {
    const mod = await import('@vercel/kv');
    return mod.kv;
  } catch {
    return null;
  }
}

async function getSubscriptions() {
  const kv = await getKv();
  if (kv) {
    const subs = await kv.get('push_subscriptions');
    return subs || [];
  }
  return [...memStore.values()];
}

async function saveSubscriptions(subs) {
  const kv = await getKv();
  if (kv) {
    await kv.set('push_subscriptions', subs);
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { subscription, ftrackServer, ftrackUser, ftrackApiKey, watchStatuses, projectId } = req.body;

      if (!subscription?.endpoint) {
        return res.status(400).json({ error: 'Missing push subscription' });
      }
      if (!ftrackServer || !ftrackUser || !ftrackApiKey) {
        return res.status(400).json({ error: 'Missing ftrack credentials' });
      }

      const entry = {
        subscription,
        ftrackServer,
        ftrackUser,
        ftrackApiKey,
        watchStatuses: watchStatuses || ['QC Ready'],
        projectId: projectId || null,
        createdAt: new Date().toISOString(),
        id: subscription.endpoint,
      };

      const subs = await getSubscriptions();
      const filtered = subs.filter(s => s.id !== entry.id);
      filtered.push(entry);
      const kvInst = await getKv();
      if (kvInst) {
        await saveSubscriptions(filtered);
      } else {
        memStore.set(entry.id, entry);
      }

      return res.status(200).json({ ok: true, message: 'Subscription saved' });

    } else if (req.method === 'DELETE') {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

      const kvInst = await getKv();
      if (kvInst) {
        const subs = await getSubscriptions();
        await saveSubscriptions(subs.filter(s => s.id !== endpoint));
      } else {
        memStore.delete(endpoint);
      }

      return res.status(200).json({ ok: true, message: 'Subscription removed' });

    } else if (req.method === 'GET') {
      const subs = await getSubscriptions();
      return res.status(200).json({
        count: subs.length,
        subscriptions: subs.map(s => ({
          user: s.ftrackUser,
          watchStatuses: s.watchStatuses,
          projectId: s.projectId,
          createdAt: s.createdAt,
        })),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[subscribe] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
