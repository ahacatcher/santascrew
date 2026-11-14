'use strict';
const { PEOPLE, PULLS_KEY, nameOf, redis, readPulls, withLock, pickRecipient, newToken, body, send, fail } = require('./_lib');

// Reaches into the bag for one person. Runs one-at-a-time on the server,
// so nobody can pull twice or grab a name someone else already took.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const id = String(body(req).id || '');
    if (!PEOPLE.some(p => p.id === id)) return send(res, 400, { error: 'Pick your name from the list first.' });

    const out = await withLock(async () => {
      const pulls = await readPulls();
      if (pulls[id]) return { code: 409, error: nameOf(id) + ' has already drawn. If that\'s you, ask the organizer.' };
      const gotId = pickRecipient(
        id, PEOPLE.map(p => p.id), Object.keys(pulls), Object.values(pulls).map(p => p.gotId)
      );
      if (!gotId) return { code: 409, error: 'No valid names are left in the bag. Tell the organizer.' };
      const token = newToken('k');
      await redis().hset(PULLS_KEY, { [id]: { gotId, token, at: Date.now() } });
      return { code: 200, gotId, gotName: nameOf(gotId), token };
    });

    if (out.code !== 200) return send(res, out.code, { error: out.error });
    send(res, 200, { gotId: out.gotId, gotName: out.gotName, token: out.token });
  } catch (e) { fail(res, e); }
};
