export async function onRequest({ params, request, env }) {
  const id = params.id;
  if (!id) return new Response('Missing id', { status: 400 });

  const upstream = `https://archidekt.com/api/decks/${encodeURIComponent(id)}`;
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url), request);

  // Try cache
  let cached = await cache.match(cacheKey);
  if (cached) return withCORS(cached);

  const res = await fetch(upstream, { cf: { cacheTtl: 600, cacheEverything: true } });
  const body = await res.text();
  const out = new Response(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=600, max-age=120'
    }
  });
  // Store in edge cache
  eventWaitUntilSafe(request, cache.put(cacheKey, out.clone()));
  return withCORS(out);
}

// Utility: Add permissive CORS for your static site
function withCORS(res) {
  const hdrs = new Headers(res.headers);
  hdrs.set('Access-Control-Allow-Origin', '*');
  hdrs.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  hdrs.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: hdrs });
}

// Defensive waitUntil in Pages Functions
function eventWaitUntilSafe(request, p) {
  if ('waitUntil' in request && typeof request.waitUntil === 'function') {
    request.waitUntil(p);
  }
}
