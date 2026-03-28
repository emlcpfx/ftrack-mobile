// Receives ftrack webhook events and sends push notifications
// when a Task status changes to "QC Ready".
//
// ftrack webhook setup:
//   1. Go to ftrack Settings → Webhooks → Create Webhook
//   2. URL: https://your-domain.com/api/webhook
//   3. Secret: set FTRACK_WEBHOOK_SECRET env var to match
//   4. Events: select "Task → Status changed" (or use update topic for task)
//
// Alternatively, use ftrack's action/event system with topic:
//   "ftrack.update" where entity_type = "Task"

import webpush from 'web-push';
import { createHmac } from 'crypto';
import { getSubscriptions, removeSubscription } from './lib/store.js';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@cleanplatefx.com';
const WEBHOOK_SECRET = process.env.FTRACK_WEBHOOK_SECRET;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

function verifySignature(req) {
  if (!WEBHOOK_SECRET) return true; // skip verification if no secret configured
  const signature = req.headers['x-ftrack-signature'] || req.headers['x-hook-signature'] || '';
  if (!signature) return false;
  const body = JSON.stringify(req.body);
  const expected = createHmac('sha1', WEBHOOK_SECRET).update(body).digest('hex');
  return signature === expected || signature === `sha1=${expected}`;
}

async function sendPushToAll(payload) {
  const subscriptions = getSubscriptions();
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(sub, JSON.stringify(payload)).catch(err => {
        // Remove expired/invalid subscriptions
        if (err.statusCode === 404 || err.statusCode === 410) {
          removeSubscription(sub.endpoint);
        }
        throw err;
      })
    )
  );
  const sent = results.filter(r => r.status === 'fulfilled').length;
  return { sent, total: subscriptions.length };
}

// Extract relevant info from ftrack webhook payload
function parseEvent(body) {
  // ftrack webhooks send an array of events
  // Each event has: topic, data (with entities array)
  // For status changes, look at update events where keys include "status_id"

  const events = Array.isArray(body) ? body : [body];

  for (const event of events) {
    // Handle ftrack update events
    const topic = event.topic || '';
    if (!topic.includes('update') && !topic.includes('change')) continue;

    const entities = event.data?.entities || [];
    for (const entity of entities) {
      const entityType = (entity.entity_type || entity.entityType || '').toLowerCase();
      if (entityType !== 'task') continue;

      const changes = entity.changes || entity.keys || {};
      // Check if status_id was changed
      if (changes.status_id || changes.statusid) {
        return {
          entityType: 'Task',
          entityName: entity.name || entity.entity_name || 'Unknown Task',
          entityId: entity.entity_id || entity.entityId || entity.id,
          parentName: entity.parent_name || entity.parentName || '',
          newStatusId: changes.status_id?.new || changes.statusid?.new || null,
          newStatusName: entity.status_name || entity.statusName || null,
          userName: event.data?.user_name || event.source?.user?.username || 'Someone',
        };
      }
    }
  }
  return null;
}

export default async function handler(req, res) {
  // Accept GET for health checks
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'ftrack-push-webhook' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifySignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ error: 'VAPID keys not configured' });
  }

  const body = req.body;

  // Parse the ftrack event
  const event = parseEvent(body);
  if (!event) {
    return res.status(200).json({ ok: true, action: 'ignored', reason: 'not a task status change' });
  }

  // Check if the new status is "QC Ready" (case-insensitive)
  // We check the status name if provided, otherwise you can configure
  // the target status ID via env var FTRACK_QC_READY_STATUS_ID
  const targetStatusId = process.env.FTRACK_QC_READY_STATUS_ID;
  const statusName = (event.newStatusName || '').toLowerCase();
  const isQCReady = statusName.includes('qc ready') ||
                    statusName.includes('qc_ready') ||
                    (targetStatusId && event.newStatusId === targetStatusId);

  if (!isQCReady) {
    return res.status(200).json({ ok: true, action: 'ignored', reason: `status "${event.newStatusName}" is not QC Ready` });
  }

  // Build notification
  const taskLabel = event.parentName
    ? `${event.parentName} → ${event.entityName}`
    : event.entityName;

  const payload = {
    title: 'QC Ready',
    body: `${event.userName} marked ${taskLabel} as QC Ready`,
    tag: `qc-ready-${event.entityId}`,
    url: '/',
  };

  const result = await sendPushToAll(payload);
  return res.status(200).json({ ok: true, action: 'notified', ...result });
}
