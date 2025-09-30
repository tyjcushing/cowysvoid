export async function onRequest({ request }) {
  const url = new URL(request.url);
  // passthrough query: owner, pageSize, orderBy, descending, etc.
  const upstream = new URL('https://archidekt.com/api/decks/');
  for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

  const cache = caches.default;
  const cacheKey = new Request(upstream.toString(), request);
  let cached = await cache.match(cacheKey);
  if (cached) return withCORS(cached);

  const res = await fetch(upstream.toString(), { cf: { cacheTtl: 600, cacheEverything: true } });
  const body = await res.text();
  const out = new Response(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=600, max-age=120'
    }
  });
  await cache.put(cacheKey, out.clone());
  return withCORS(out);
}

function withCORS(res) {
  const hdrs = new Headers(res.headers);
  hdrs.set('Access-Control-Allow-Origin', '*');
  hdrs.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  hdrs.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: hdrs });
}
