import { afterEach, describe, expect, mock, test } from "bun:test";

let userId = "owner-from-session";
mock.module("server-only", () => ({}));
mock.module("../src/lib/auth/server.ts", () => ({
  auth: { getSession: async () => ({ data: userId ? { user: { id: userId } } : null }) },
}));
const { ragProxy } = await import("../src/lib/rag-proxy.ts");
const { GET } = await import("../src/app/api/agents/[[...path]]/route.ts");
const originalFetch = globalThis.fetch;
const originalToken = process.env.BACKEND_API_TOKEN;
const originalUrl = process.env.BACKEND_URL;

afterEach(() => {
  globalThis.fetch = originalFetch;
  userId = "owner-from-session";
  if (originalToken === undefined) delete process.env.BACKEND_API_TOKEN;
  else process.env.BACKEND_API_TOKEN = originalToken;
  if (originalUrl === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = originalUrl;
});

function configure() {
  process.env.BACKEND_API_TOKEN = "fixture-service-token";
  process.env.BACKEND_URL = "https://backend.test";
}

describe("Agent API transport", () => {
  test("forwards PATCH bodies and uses the authenticated owner instead of client headers", async () => {
    configure();
    const upstream = mock(async () => Response.json({ agent: { version: 2 } }));
    globalThis.fetch = upstream;
    const body = JSON.stringify({ name: "Updated", version: 1 });
    const request = new Request("https://app.test/api/agents/id", {
      method: "PATCH", headers: { Origin: "https://app.test", "X-User-Id": "forged" }, body,
    });
    const response = await ragProxy(request, "agents/id");
    expect(response.status).toBe(200);
    const [url, options] = upstream.mock.calls[0];
    expect(url.href).toBe("https://backend.test/v1/agents/id");
    expect(options.method).toBe("PATCH");
    expect(new TextDecoder().decode(options.body)).toBe(body);
    expect(options.headers["X-User-Id"]).toBe("owner-from-session");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  test("blocks cross-origin mutations and anonymous reads before reaching the backend", async () => {
    configure();
    const upstream = mock(); globalThis.fetch = upstream;
    const crossOrigin = await ragProxy(new Request("https://app.test/api/agents/id", { method: "PATCH", headers: { Origin: "https://other.test" }, body: "{}" }), "agents/id");
    expect(crossOrigin.status).toBe(403);
    userId = null;
    const anonymous = await ragProxy(new Request("https://app.test/api/agents"), "agents");
    expect(anonymous.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("enforces the body limit on PATCH updates", async () => {
    configure();
    const upstream = mock(); globalThis.fetch = upstream;
    const response = await ragProxy(new Request("https://app.test/api/agents/id", { method: "PATCH", headers: { Origin: "https://app.test" }, body: "x".repeat(200001) }), "agents/id");
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("rejects catch-all paths outside the agent API allowlist", async () => {
    const upstream = mock(); globalThis.fetch = upstream;
    const response = await GET(new Request("https://app.test/api/agents/anything"), { params: Promise.resolve({ path: ["..", "knowledge-base", "documents"] }) });
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("preserves the empty successful delete response", async () => {
    configure();
    globalThis.fetch = mock(async () => new Response(null, { status: 204 }));
    const response = await ragProxy(new Request("https://app.test/api/agents/id", { method: "DELETE", headers: { Origin: "https://app.test" } }), "agents/id");
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
