import "server-only";
import { auth } from "@/lib/auth/server";

export async function ragProxy(request: Request, path: string) {
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const token = process.env.BACKEND_API_TOKEN;
  if (!token) return Response.json({ error: "Configure BACKEND_API_TOKEN on the frontend server." }, { status: 503 });
  try {
    let body: Uint8Array | undefined;
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      const reader = request.body?.getReader();
      const parts: Uint8Array[] = [];
      let length = 0;
      if (reader) {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 200_000) {
            await reader.cancel();
            return Response.json({ error: "Request is too large." }, { status: 413 });
          }
          parts.push(chunk.value);
        }
      }
      body = new Uint8Array(length);
      let offset = 0;
      for (const part of parts) { body.set(part, offset); offset += part.byteLength; }
    }
    const response = await fetch(new URL(`/v1/${path}`, process.env.BACKEND_URL || "http://127.0.0.1:8000"), {
      method: request.method,
      headers: { Authorization: `Bearer ${token}`, "X-User-Id": session.user.id, "Content-Type": "application/json" },
      body: body as BodyInit | undefined,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
      redirect: "manual",
      cache: "no-store",
    });
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    for (const name of ["content-type", "location", "x-accel-buffering"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ error: "The backend is unavailable. Check BACKEND_URL and try again." }, { status: 503 });
  }
}
