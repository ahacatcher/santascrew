'use strict';
const crypto = require('crypto');
const { nameOf, readPulls, body, send, fail } = require('./_lib');

// Lets a player see their own pull again. Needs the private token their
// device got when they drew, so nobody can peek at someone else's name.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = body(req);
    const pulls = await readPulls();
    const mine = pulls[String(b.id || '')];
    const given = Buffer.from(String(b.token || ''));
    const real = Buffer.from(String((mine && mine.token) || ''));
    const ok = mine && given.length === real.length && crypto.timingSafeEqual(given, real);
    if (!ok) return send(res, 403, { error: 'This device can\'t show that draw. Ask the organizer.' });
    send(res, 200, { gotId: mine.gotId, gotName: nameOf(mine.gotId) });
  } catch (e) { fail(res, e); }
};
