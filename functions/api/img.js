export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) return new Response("Missing ?url=", { status: 400 });

  let upstream;
  try { upstream = new URL(target); }
  catch { return new Response("Invalid url", { status: 400 }); }

  const allowedHosts = new Set(["cards.scryfall.io", "svgs.scryfall.io"]);
  if (!allowedHosts.has(upstream.hostname)) {
    return new Response("Host not allowed", { status: 403 });
  }

  const res = await fetch(upstream.toString(), {
    headers: { "User-Agent": "cowysvoid-pages-proxy" }
  });

  if (!res.ok) return new Response(`Upstream error: ${res.status}`, { status: 502 });

  return new Response(res.body, {
    status: 200,
    headers: {
      "content-type": res.headers.get("content-type") || "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
