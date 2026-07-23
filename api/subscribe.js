/**
 * Push notification subscription management
 *
 * Stores push endpoints + watch config in Vercel KV.
 * Does NOT store client ftrack API keys — cron uses server env:
 *   FTRACK_SERVER, FTRACK_API_USER, FTRACK_API_KEY
 *
 * POST /api/subscribe — save a push subscription
 * DELETE /api/subscribe — remove a push subscription
 * GET /api/subscribe — list subscriptions (admin, for debugging)
 */

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
    return Array.isArray(subs) ? subs : [];
  }
  return [...memStore.values()];
}

async function saveSubscriptions(subs) {
  const kv = await getKv();
  if (kv) {
    await kv.set('push_subscriptions', subs);
  }
}

function resolveFtrackCreds(body = {}) {
  const fromEnv = {
    server: process.env.FTRACK_SERVER || null,
    user: process.env.FTRACK_API_USER || null,
    apiKey: process.env.FTRACK_API_KEY || null,
  };
  if (fromEnv.server && fromEnv.user && fromEnv.apiKey) {
    return { ...fromEnv, source: 'env' };
  }
  // Fallback: logged-in user's creds from the client (solo / no Vercel env)
  if (body.ftrackServer && body.ftrackUser && body.ftrackApiKey) {
    return {
      server: body.ftrackServer,
      user: body.ftrackUser,
      apiKey: body.ftrackApiKey,
      source: 'client',
    };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { subscription, ftrackUser, ftrackServer, ftrackApiKey, watchStatuses, projectId } = req.body;

      if (!subscription?.endpoint) {
        return res.status(400).json({ error: 'Missing push subscription' });
      }

      const creds = resolveFtrackCreds(req.body);
      if (!creds) {
        return res.status(400).json({
          error: 'Missing ftrack credentials (log in, or set FTRACK_* on the server)',
        });
      }

      const user = ftrackUser || creds.user;
      if (!user) {
        return res.status(400).json({ error: 'Missing ftrack user' });
      }

      const entry = {
        subscription,
        ftrackUser: user,
        ftrackServer: ftrackServer || creds.server,
        // Only persist client key when server env is absent (legacy / solo deploy)
        ...(creds.source === 'client' ? { ftrackApiKey: ftrackApiKey || creds.apiKey } : {}),
        watchStatuses: watchStatuses || ['QC Ready'],
        projectId: projectId || null,
        createdAt: new Date().toISOString(),
        id: subscription.endpoint,
        credSource: creds.source,
      };

      const subs = await getSubscriptions();
      const filtered = subs.filter((s) => s.id !== entry.id);
      // Drop legacy keys when using env mode
      const cleaned = filtered.map((s) => {
        if (creds.source === 'env') {
          const { ftrackApiKey: _drop, ...rest } = s;
          return rest;
        }
        return s;
      });
      cleaned.push(entry);
      const kvInst = await getKv();
      if (kvInst) {
        await saveSubscriptions(cleaned);
      } else {
        memStore.set(entry.id, entry);
      }

      return res.status(200).json({ ok: true, message: 'Subscription saved', credSource: creds.source });
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });

      const kvInst = await getKv();
      if (kvInst) {
        const subs = await getSubscriptions();
        await saveSubscriptions(subs.filter((s) => s.id !== endpoint));
      } else {
        memStore.delete(endpoint);
      }

      return res.status(200).json({ ok: true, message: 'Subscription removed' });
    }

    if (req.method === 'GET') {
      const subs = await getSubscriptions();
      const envConfigured = !!(
        process.env.FTRACK_SERVER
        && process.env.FTRACK_API_USER
        && process.env.FTRACK_API_KEY
      );
      return res.status(200).json({
        count: subs.length,
        serverCredsConfigured: envConfigured,
        subscriptions: subs.map((s) => ({
          user: s.ftrackUser,
          watchStatuses: s.watchStatuses,
          projectId: s.projectId,
          createdAt: s.createdAt,
          credSource: s.credSource || (s.ftrackApiKey ? 'client' : 'unknown'),
        })),
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[subscribe] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
