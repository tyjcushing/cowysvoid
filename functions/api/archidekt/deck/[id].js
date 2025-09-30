// functions/api/archidekt/deck/[id].js
export async function onRequest(context) {
  const { params, request } = context;
  const id = params?.id;

  if (!id || !/^\d+$/.test(id)) {
    return json({ ok:false, where:'edge', error:'Missing or invalid id', id }, 400);
  }

  const upstream = `https://archidekt.com/api/decks/${encodeURIComponent(id)}`;

  // Edge cache
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url), request);
  const cached = await cache.match(cacheKey);
  if (cached) return withCORS(cached);

  let upstreamRes, body;
  try {
    upstreamRes = await fetch(upstream, { cf: { cacheTtl: 600, cacheEverything: true } });
    body = await upstreamRes.text();
  } catch (e) {
    return json({ ok:false, where:'edge', error:'Upstream fetch failed', detail:String(e), upstream }, 502);
  }

  if (!upstreamRes.ok) {
    // Surface upstream error as JSON so you can see what’s wrong
    return json({
      ok:false, where:'upstream',
      status: upstreamRes.status, statusText: upstreamRes.statusText,
      upstream
    }, upstreamRes.status);
  }

  const out = new Response(body, {
    status: 200,
    headers: {
      'content-type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
      'cache-control': 'public, s-maxage=600, max-age=120'
    }
  });

  if (typeof context.waitUntil === 'function') context.waitUntil(cache.put(cacheKey, out.clone()));
  return withCORS(out);
}

function withCORS(res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(res.body, { status: res.status, headers: h });
}

function json(obj, status = 200) {
  return withCORS(new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' }
  }));
}
