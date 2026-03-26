/**
 * ftrack API diagnostic — tests every query/mutation in src/api/ftrack.js
 * Run: node test-api.mjs
 */
import { Session } from '@ftrack/api';
import { readFileSync } from 'fs';

// Load .env manually (no dotenv dependency)
const env = {};
readFileSync('.env', 'utf8').split('\n').forEach(line => {
  const m = line.match(/^\s*([^#=]+?)\s*=\s*"?(.*?)"?\s*$/);
  if (m) env[m[1]] = m[2];
});

const SERVER = env.FTRACK_SERVER_URL.replace(/\/+$/, '');
const API_KEY = env.FTRACK_API_KEY;
const API_USER = env.FTRACK_API_USER;

console.log(`\nConnecting to ${SERVER} as ${API_USER}...\n`);

const session = new Session(SERVER, API_USER, API_KEY, { autoConnectEventHub: false });
await session.initializing;
console.log('Session initialized OK\n');

const results = [];

async function test(name, fn) {
  try {
    const data = await fn();
    const count = Array.isArray(data) ? data.length : (data ? 1 : 0);
    console.log(`  PASS  ${name}  (${count} results)`);
    results.push({ name, status: 'PASS', count, sample: Array.isArray(data) ? data[0] : data });
    return data;
  } catch (e) {
    const msg = e.message || String(e);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg.split('\n')[0]}`);
    results.push({ name, status: 'FAIL', error: msg.split('\n')[0] });
    return null;
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

// 1. fetchReviews
const reviews = await test('fetchReviews', async () => {
  const r = await session.query(
    `select id, name, created_at from ReviewSession order by created_at descending limit 50`
  );
  return r.data;
});

// 2. fetchReviewShots (needs a real review session id)
let reviewId = reviews?.[0]?.id;
if (reviewId) {
  await test('fetchReviewShots (original query)', async () => {
    const r = await session.query(
      `select id, name, sort,
              version.id, version.version,
              version.asset.parent.name,
              version.thumbnail_id,
              version.status.name, version.status.color,
              version.user.first_name
       from ReviewSessionObject
       where review_session_id is "${reviewId}"`
    );
    return r.data;
  });

  // Try without 'sort' in case that attribute doesn't exist
  await test('fetchReviewShots (without sort)', async () => {
    const r = await session.query(
      `select id, name,
              version.id, version.version,
              version.asset.parent.name,
              version.thumbnail_id,
              version.status.name, version.status.color,
              version.user.first_name
       from ReviewSessionObject
       where review_session_id is "${reviewId}"`
    );
    return r.data;
  });

  // Try with version.user → version.asset.versions.user to check relationship
  await test('fetchReviewShots (minimal)', async () => {
    const r = await session.query(
      `select id, name, version.id, version.version
       from ReviewSessionObject
       where review_session_id is "${reviewId}"`
    );
    return r.data;
  });
} else {
  console.log('  SKIP  fetchReviewShots — no review sessions found');
}

// 3. fetchProjects
const projects = await test('fetchProjects', async () => {
  const r = await session.query(
    `select id, name, full_name from Project where status is active order by name ascending`
  );
  return r.data;
});

// 4. fetchShots (needs a project id)
let projectId = projects?.[0]?.id;
let shots = null;
if (projectId) {
  shots = await test(`fetchShots (project: ${projects[0].name})`, async () => {
    const r = await session.query(
      `select id, name, status.id, status.name, status.color, thumbnail_id
       from Shot
       where project.id is "${projectId}"
       order by name ascending
       limit 200`
    );
    return r.data;
  });
} else {
  console.log('  SKIP  fetchShots — no active projects found');
}

// 5. fetchStatuses
await test('fetchStatuses', async () => {
  const r = await session.query(
    `select id, name, color from Status order by sort ascending`
  );
  return r.data;
});

// 6. fetchVersionComponents (need an AssetVersion id)
let versionId = null;
if (projectId) {
  const versions = await test('fetch AssetVersions (to get a version id)', async () => {
    const r = await session.query(
      `select id, version, status.name, thumbnail_id
       from AssetVersion
       where asset.parent.project.id is "${projectId}"
       limit 5`
    );
    return r.data;
  });
  versionId = versions?.[0]?.id;
}

if (versionId) {
  await test('fetchVersionComponents', async () => {
    const r = await session.query(
      `select id, name, file_type from Component where version_id is "${versionId}"`
    );
    return r.data;
  });
} else {
  console.log('  SKIP  fetchVersionComponents — no versions found');
}

// 7. fetchNotes (try on a shot or version)
const noteParentId = shots?.[0]?.id || versionId;
if (noteParentId) {
  await test('fetchNotes', async () => {
    const r = await session.query(
      `select id, content, date, author.first_name, author.last_name
       from Note
       where parent_id is "${noteParentId}"
       order by date ascending`
    );
    return r.data;
  });
} else {
  console.log('  SKIP  fetchNotes — no parent entity found');
}

// 8. getThumbnailUrl — test the URL construction
if (shots?.[0]?.thumbnail_id) {
  await test('getThumbnailUrl (fetch test)', async () => {
    const tid = shots[0].thumbnail_id;
    const url = typeof session.thumbnailUrl === 'function'
      ? session.thumbnailUrl(tid, { size: 160 })
      : `${SERVER}/component/thumbnail?id=${tid}&size=160`;
    const res = await fetch(url, { method: 'HEAD' });
    return { url, status: res.status, ok: res.ok };
  });
} else {
  console.log('  SKIP  getThumbnailUrl — no thumbnail_id found');
}

// 9. getComponentUrl
if (versionId) {
  await test('getComponentUrl', async () => {
    try {
      const comps = await session.query(
        `select id from Component where version_id is "${versionId}" limit 1`
      );
      if (comps.data.length === 0) return { note: 'no components on this version' };
      const cid = comps.data[0].id;
      const urls = await session.getComponentUrls([cid]);
      return { componentId: cid, url: urls[cid] };
    } catch (e) {
      throw e;
    }
  });
}

// 10. Test mutations (read-only — we won't actually change data)
// Just verify the session.update method exists and the entity schemas are known
await test('session.update exists', async () => {
  if (typeof session.update !== 'function') throw new Error('session.update is not a function');
  return { exists: true };
});

await test('session.create exists', async () => {
  if (typeof session.create !== 'function') throw new Error('session.create is not a function');
  return { exists: true };
});

// ── Bonus: explore ReviewSessionObject schema ────────────────────────────────
// This helps identify valid attributes
await test('ReviewSessionObject schema (introspect)', async () => {
  const r = await session.query(
    `select id, name from ReviewSessionObject limit 1`
  );
  if (r.data.length > 0) {
    const obj = r.data[0];
    return { keys: Object.keys(obj), sample: obj };
  }
  return { note: 'no ReviewSessionObjects exist' };
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
const passed = results.filter(r => r.status === 'PASS');
const failed = results.filter(r => r.status === 'FAIL');
console.log(`  ${passed.length} passed, ${failed.length} failed\n`);
if (failed.length) {
  console.log('FAILURES:');
  failed.forEach(f => {
    console.log(`  ${f.name}`);
    console.log(`    → ${f.error}`);
  });
}

// Print sample data for debugging
console.log('\n' + '='.repeat(70));
console.log('SAMPLE DATA');
console.log('='.repeat(70));
results.filter(r => r.status === 'PASS' && r.sample).forEach(r => {
  console.log(`\n  ${r.name}:`);
  console.log('  ' + JSON.stringify(r.sample, null, 2).split('\n').join('\n  '));
});

console.log('\n');
process.exit(failed.length ? 1 : 0);
