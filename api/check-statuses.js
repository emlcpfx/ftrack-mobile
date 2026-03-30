/**
 * Poll ftrack for status changes and send push notifications.
 *
 * Called by Vercel Cron every minute.
 * For each subscriber, queries ftrack for tasks that recently changed
 * to a watched status, and sends a push notification.
 *
 * GET /api/check-statuses (invoked by cron)
 */

import webpush from 'web-push';
import { FtrackClient } from './ftrack-client.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@cleanplatefx.com';

// How far back to look for changes (in minutes)
const LOOKBACK_MINUTES = 2;

export const config = { maxDuration: 30 };

let kv = null;
try {
  const mod = await import('@vercel/kv');
  kv = mod.kv;
} catch {}

async function getSubscriptions() {
  if (kv) {
    return (await kv.get('push_subscriptions')) || [];
  }
  return [];
}

async function removeSubscription(endpoint) {
  if (kv) {
    const subs = await getSubscriptions();
    await kv.set('push_subscriptions', subs.filter(s => s.id !== endpoint));
  }
}

export default async function handler(req, res) {
  // Only allow GET (cron trigger)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret if set (optional security)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

  const subs = await getSubscriptions();
  if (subs.length === 0) {
    return res.status(200).json({ message: 'No subscribers', sent: 0 });
  }

  const now = new Date();
  const lookback = new Date(now.getTime() - LOOKBACK_MINUTES * 60 * 1000);
  const lookbackStr = lookback.toISOString().replace('T', ' ').slice(0, 19);

  let totalSent = 0;
  const errors = [];

  for (const sub of subs) {
    try {
      const client = new FtrackClient(sub.ftrackServer, sub.ftrackUser, sub.ftrackApiKey);

      // Build status filter
      const statusNames = (sub.watchStatuses || ['QC Ready'])
        .map(s => `"${s}"`)
        .join(', ');

      // Query tasks whose status was recently updated to a watched status
      // We use date.updated > lookback to find recently changed tasks
      let query = `select id, name, status.name, parent.name, type.name
        from Task
        where status.name in (${statusNames})
        and date >= "${lookbackStr}"`;

      if (sub.projectId) {
        query += ` and project_id is "${sub.projectId}"`;
      }

      query += ' limit 20';

      const result = await client.query(query);
      const tasks = result?.data || [];

      if (tasks.length === 0) continue;

      // Check against last-notified set to avoid duplicates
      const lastNotifiedKey = `notified:${sub.id}`;
      let lastNotified = new Set();
      if (kv) {
        const prev = await kv.get(lastNotifiedKey);
        if (prev) lastNotified = new Set(prev);
      }

      const newTasks = tasks.filter(t => !lastNotified.has(t.id));
      if (newTasks.length === 0) continue;

      // Build notification payload
      const payload = JSON.stringify({
        title: `${newTasks.length} task${newTasks.length > 1 ? 's' : ''} now ${sub.watchStatuses[0]}`,
        body: newTasks.map(t => `${t.parent?.name || ''} / ${t.name}`).join('\n'),
        icon: '/icons/icon.svg',
        badge: '/icons/icon.svg',
        data: {
          url: '/',
          tasks: newTasks.map(t => ({ id: t.id, name: t.name, shot: t.parent?.name })),
        },
      });

      // Send push notification
      await webpush.sendNotification(sub.subscription, payload);
      totalSent++;

      // Update last-notified set (keep last 200 IDs to prevent unbounded growth)
      const updatedNotified = [...lastNotified, ...newTasks.map(t => t.id)].slice(-200);
      if (kv) {
        await kv.set(lastNotifiedKey, updatedNotified, { ex: 86400 }); // 24h TTL
      }

    } catch (err) {
      console.error(`[check-statuses] Error for ${sub.ftrackUser}:`, err.message);

      // If push subscription expired, remove it
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`[check-statuses] Removing expired subscription for ${sub.ftrackUser}`);
        await removeSubscription(sub.id);
      }

      errors.push({ user: sub.ftrackUser, error: err.message });
    }
  }

  return res.status(200).json({
    message: `Checked ${subs.length} subscribers, sent ${totalSent} notifications`,
    sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
