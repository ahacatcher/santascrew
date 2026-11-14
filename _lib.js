'use strict';
// Shared helpers for the Secret Santa functions.
// Files starting with "_" in /api are NOT exposed as web endpoints.
const crypto = require('crypto');

// The final list of players. To change it, edit here and redeploy.
const PEOPLE = [
  { id: 'michelle', name: 'Michelle' },
  { id: 'tameka',   name: 'Tameka' },
  { id: 'lakenya',  name: 'LaKenya' },
  { id: 'kawanna',  name: 'Kawanna' },
  { id: 'floria',   name: 'Floria' },
  { id: 'sheldon',  name: 'Sheldon' }
];

const PULLS_KEY = 'santa:pulls';   // hash: drawerId -> { gotId, token, at }
const LOCK_KEY  = 'santa:lock';

let _redis = null;
function redis() {
  if (_redis) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) { const e = new Error('The database is not connected yet.'); e.code = 'NO_DB'; throw e; }
  const { Redis } = require('@upstash/redis');
  _redis = new Redis({ url, token });
  return _redis;
}
function setRedis(r) { _redis = r; }   // used by tests

function nameOf(id) { const p = PEOPLE.find(x => x.id === id); return p ? p.name : id; }

// Tokens always start with a letter so Redis never turns them into numbers.
function newToken(prefix) { return prefix + crypto.randomBytes(16).toString('hex'); }

async function readPulls() {
  const raw = (await redis().hgetall(PULLS_KEY)) || {};
  const out = {};
  for (const k of Object.keys(raw)) {
    let v = raw[k];
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { continue; } }
    out[k] = v;
  }
  return out;
}

// One person at a time reaches into the bag.
async function withLock(fn) {
  const r = redis();
  const tok = newToken('t');
  for (let i = 0; i < 25; i++) {
    const ok = await r.set(LOCK_KEY, tok, { nx: true, ex: 10 });
    if (ok) {
      try { return await fn(); }
      finally { try { if ((await r.get(LOCK_KEY)) === tok) await r.del(LOCK_KEY); } catch (e) { /* lock expires on its own */ } }
    }
    await new Promise(res => setTimeout(res, 120 + Math.random() * 260));
  }
  const e = new Error('Someone else is pulling right now. Try again in a moment.'); e.code = 'BUSY'; throw e;
}

// Picks who `meId` pulls: never yourself, never a name already taken, and it
// avoids the "last person is left holding only their own name" dead end.
function pickRecipient(meId, allIds, drawnIds, takenIds) {
  const drawn = new Set(drawnIds), taken = new Set(takenIds);
  const waiting = allIds.filter(id => !drawn.has(id));
  const bag = allIds.filter(id => !taken.has(id));
  let options = bag.filter(id => id !== meId);
  if (waiting.length === 2 && bag.length === 2) {
    const other = waiting.find(id => id !== meId);
    const safe = options.filter(c => {
      const left = bag.filter(x => x !== c);
      return !(left.length === 1 && left[0] === other);
    });
    if (safe.length) options = safe;
  }
  if (!options.length) return null;
  return options[crypto.randomInt(options.length)];
}

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  return b && typeof b === 'object' ? b : {};
}

function send(res, code, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).json(obj);
}

function fail(res, e) {
  if (e && e.code === 'NO_DB') return send(res, 503, { error: 'The database isn\'t connected yet. Tell the organizer.' });
  if (e && e.code === 'BUSY') return send(res, 429, { error: e.message });
  console.error(e);
  return send(res, 500, { error: 'Something went wrong. Please try again.' });
}

function passcodeOk(given) {
  const real = process.env.ADMIN_PASSCODE;
  if (!real) return null;                       // not configured
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  PEOPLE, PULLS_KEY, nameOf, redis, setRedis, readPulls, withLock,
  pickRecipient, newToken, body, send, fail, passcodeOk
};
