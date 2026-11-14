'use strict';
const { PEOPLE, PULLS_KEY, nameOf, redis, readPulls, withLock, body, send, fail, passcodeOk } = require('./_lib');

// Organizer only (needs ADMIN_PASSCODE). Actions: view, reset-one, reset-all.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    const ok = passcodeOk(b.passcode);
    if (ok === null) return send(res, 503, { error: 'ADMIN_PASSCODE isn\'t set in Vercel yet.' });
    if (!ok) {
      await new Promise(r => setTimeout(r, 700));   // slows down guessing
      return send(res, 401, { error: 'That passcode didn\'t match.' });
    }

    if (b.action === 'reset-one') {
      const id = String(b.id || '');
      await withLock(async () => { await redis().hdel(PULLS_KEY, id); });
    } else if (b.action === 'reset-all') {
      await withLock(async () => { await redis().del(PULLS_KEY); });
    }

    const pulls = await readPulls();
    const rows = Object.keys(pulls)
      .map(id => ({ drawerId: id, drawerName: nameOf(id), gotId: pulls[id].gotId, gotName: nameOf(pulls[id].gotId), at: pulls[id].at || 0 }))
      .sort((a, c) => a.at - c.at);
    const taken = new Set(rows.map(r => r.gotId));
    send(res, 200, {
      total: PEOPLE.length,
      pulls: rows,
      notDrawn: PEOPLE.filter(p => !pulls[p.id]).map(p => ({ id: p.id, name: p.name })),
      inBag: PEOPLE.filter(p => !taken.has(p.id)).map(p => ({ id: p.id, name: p.name }))
    });
  } catch (e) { fail(res, e); }
};
