// functions/api/archidekt/deck/[id].js
export async function onRequest(context) {
  const { params, request } = context;
  const id = params?.id;

  // 1) Validate ID
  if (!id || !/^\d+$/.test(id)) {
    return json({ ok: false, where: 'edge', error: 'Missing or invalid id', id }, 400);
  }

  // 2) Build upstream URL
  const upstream = `https://archidekt.com/api/decks/${encodeURIComponent(id)}`;

  // 3) Edge cache key (cache your proxy response)
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url), request);

  // 4) Try edge cache first
  const cached = await cache.match(cacheKey);
  if (cached) return withCORS(cached);

  // 5) Fetch upstream
  let upstreamRes;
  let upstreamText;
  try {
    upstreamRes = await fetch(upstream, {
      // Cache at Cloudflare edge for 10 minutes
      cf: { cacheTtl: 600, cacheEverything: true }
    });
    upstreamText = await upstreamRes.text();
  } catch (e) {
    // Network or DNS issues reaching Archidekt
    return json({ ok: false, where: 'edge', error: 'Upstream fetch failed', detail: String(e), upstream }, 502);
  }

  // 6) If upstream is NOT 200, return diagnostics (so you don’t debug blind 404s)
  if (!upstreamRes.ok) {
    const out = json({
      ok: false,
      where: 'upstream',
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      upstream,
      hint: 'Open "upstream" URL directly in your browser. If THAT is 200, your function path is fine but Archidekt refused this id. If THAT is 404, the deck id is invalid or not public.'
    }, upstreamRes.status);
    // Don’t cache errors
    return withCORS(out);
  }

  // 7) Build a pass-through JSON response
  const out = new Response(upstreamText, {
    status: upstreamRes.status,
    headers: {
      'content-type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=600, max-age=120'
    }
  });

  // 8) Save to edge cache (fire and forget)
  if (typeof context.waitUntil === 'function') {
    context.waitUntil(cache.put(cacheKey, out.clone()));
  }

  return withCORS(out);
}

// ----- helpers -----
function withCORS(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200) {
  return withCORS(new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  }));
}
