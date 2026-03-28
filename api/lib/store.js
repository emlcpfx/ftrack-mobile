// Simple push subscription store.
// Uses filesystem on VPS, falls back to /tmp for serverless (Vercel).
// For production on Vercel, swap this for Vercel KV or a database.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.PUSH_STORE_DIR || '/tmp';
const FILE = join(DATA_DIR, 'ftrack-push-subscriptions.json');

function load() {
  try {
    if (existsSync(FILE)) {
      return JSON.parse(readFileSync(FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function save(subs) {
  writeFileSync(FILE, JSON.stringify(subs, null, 2));
}

export function getSubscriptions() {
  return load();
}

export function addSubscription(subscription) {
  const subs = load();
  // Deduplicate by endpoint
  const exists = subs.find(s => s.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push(subscription);
    save(subs);
  }
  return subs;
}

export function removeSubscription(endpoint) {
  let subs = load();
  subs = subs.filter(s => s.endpoint !== endpoint);
  save(subs);
  return subs;
}
