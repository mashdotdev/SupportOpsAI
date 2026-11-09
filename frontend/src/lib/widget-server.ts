import "server-only";

export function widgetBackend(path: string, init: RequestInit = {}) {
  const secret = process.env.BACKEND_API_TOKEN;
  if (!secret) throw new Error("Widget service is not configured.");
  const headers = new Headers(init.headers);
  headers.set("X-Widget-Service-Token", secret);
  return fetch(
    `${process.env.BACKEND_URL || "http://127.0.0.1:8000"}/v1/public/widgets/${path}`,
    {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(120000),
      ]),
    },
  );
}
