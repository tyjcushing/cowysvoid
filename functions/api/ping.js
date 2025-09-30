export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, where: "edge" }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
