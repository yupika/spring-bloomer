// Spring Bloomer log API (Cloudflare Worker)
// Single endpoint: POST /log  -- accepts a finished-game payload and stores it in D1.

const MAX_PAYLOAD_BYTES = 200_000; // ~200KB per game; plenty for our event volume

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = parseAllowed(env.ALLOWED_ORIGINS);
    const corsOrigin = allowed.has(origin) ? origin : '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(corsOrigin) });
    }

    if (url.pathname === '/log' && request.method === 'POST') {
      return handleLog(request, env, corsOrigin);
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true }, 200, corsOrigin);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(corsOrigin) });
  },
};

function parseAllowed(envVar) {
  const set = new Set();
  if (!envVar) return set;
  for (const o of String(envVar).split(',')) {
    const v = o.trim();
    if (v) set.add(v);
  }
  return set;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function handleLog(request, env, origin) {
  if (!origin) {
    return json({ error: 'origin not allowed' }, 403, origin);
  }

  // Read raw bytes so we can enforce a hard limit before parsing JSON.
  const raw = await request.text();
  if (raw.length > MAX_PAYLOAD_BYTES) {
    return json({ error: 'payload too large' }, 413, origin);
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid JSON' }, 400, origin);
  }

  const v = validate(body);
  if (v.error) return json({ error: v.error }, 400, origin);

  const ua = (request.headers.get('User-Agent') || '').slice(0, 200);

  try {
    await env.DB.prepare(`
      INSERT INTO games (
        uid, app_version, num_players, num_battles,
        started_at, ended_at, winner_seat, win_reason, winner_score,
        mode, my_seat, log_json, ua
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.uid,
      body.app_version || null,
      body.num_players ?? null,
      body.num_battles ?? null,
      body.started_at ?? null,
      body.ended_at ?? null,
      body.winner_seat ?? null,
      body.win_reason || null,
      body.winner_score ?? null,
      body.mode || null,
      body.my_seat ?? null,
      raw,
      ua,
    ).run();
  } catch (err) {
    return json({ error: 'db insert failed', detail: String(err).slice(0, 200) }, 500, origin);
  }

  return json({ ok: true }, 200, origin);
}

function validate(b) {
  if (!b || typeof b !== 'object') return { error: 'body must be object' };
  if (typeof b.uid !== 'string' || b.uid.length < 8 || b.uid.length > 64) {
    return { error: 'uid must be 8-64 char string' };
  }
  if (b.num_players != null && (typeof b.num_players !== 'number' || b.num_players < 1 || b.num_players > 16)) {
    return { error: 'num_players out of range' };
  }
  if (b.events != null && !Array.isArray(b.events)) {
    return { error: 'events must be array' };
  }
  if (b.events && b.events.length > 5000) {
    return { error: 'too many events' };
  }
  if (b.mode != null && b.mode !== 'single' && b.mode !== 'multi') {
    return { error: 'mode must be single or multi' };
  }
  if (b.my_seat != null && (typeof b.my_seat !== 'number' || b.my_seat < 0 || b.my_seat > 15)) {
    return { error: 'my_seat out of range' };
  }
  return {};
}
