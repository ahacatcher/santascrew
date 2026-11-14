'use strict';
const { PEOPLE, readPulls, send, fail } = require('./_lib');

// Public: which names have drawn. Never says who got whom.
module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });
  try {
    const pulls = await readPulls();
    const people = PEOPLE.map(p => ({ id: p.id, name: p.name, drawn: !!pulls[p.id] }));
    send(res, 200, { people, left: PEOPLE.length - Object.keys(pulls).length });
  } catch (e) { fail(res, e); }
};
