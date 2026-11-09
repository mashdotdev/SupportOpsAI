import { widgetBackend } from "@/lib/widget-server";

export const maxDuration = 120;

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const parts = (await context.params).path;
  const [id, action] = parts;
  if (
    parts.length !== 2 ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id) ||
    !(
      (request.method === "GET" &&
        ["config", "conversation"].includes(action)) ||
      (request.method === "POST" &&
        ["sessions", "messages", "actions"].includes(action))
    )
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const requestURL = new URL(request.url);
  const origin = request.headers.get("origin");
  // Dev tunnels may rewrite Origin to http://localhost while preserving HTTPS
  // in the request URL. Allow this exact loopback origin only in development.
  const localTunnelOrigin =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(requestURL.hostname) &&
    origin === `http://${requestURL.host}`;
  if (
    request.method === "POST" &&
    origin !== requestURL.origin &&
    origin !== process.env.WIDGET_PUBLIC_ORIGIN &&
    !localTunnelOrigin
  ) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  try {
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 20000) {
            await reader.cancel();
            return Response.json(
              { error: "Message is too large." },
              { status: 413 },
            );
          }
          chunks.push(chunk.value);
        }
      }
      body = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    // Configure only a header overwritten by your trusted hosting proxy. Never accept a caller-supplied IP directly.
    const trustedHeader = process.env.WIDGET_CLIENT_IP_HEADER;
    const ip = trustedHeader
      ? request.headers.get(trustedHeader)?.split(",")[0]?.trim().slice(0, 200)
      : "shared";
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Widget-Client-IP": ip || "shared",
    });
    for (const name of ["X-Widget-Session", "X-Widget-Site-Origin"]) {
      const value = request.headers.get(name);
      if (value && value.length <= 500) headers.set(name, value);
    }
    const upstream = await widgetBackend(`${id}/${action}`, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      signal: request.signal,
    });
    const responseHeaders = new Headers({
      "Content-Type":
        upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    });
    if (upstream.headers.has("retry-after"))
      responseHeaders.set("Retry-After", upstream.headers.get("retry-after")!);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: "Chat is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST };
