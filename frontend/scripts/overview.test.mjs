import { afterEach, expect, mock, test } from "bun:test";
import { responseTime, trendData } from "../src/lib/overview-client.ts";

let userId = "owner-from-session";
mock.module("server-only", () => ({}));
mock.module("../src/lib/auth/server.ts", () => ({ auth: { getSession: async () => ({ data: userId ? { user: { id: userId } } : null }) } }));
const { GET, PATCH } = await import("../src/app/api/overview/[[...path]]/route.ts");
const originalFetch = globalThis.fetch;
const originalToken = process.env.BACKEND_API_TOKEN;
const originalUrl = process.env.BACKEND_URL;
afterEach(() => {
  globalThis.fetch = originalFetch; userId = "owner-from-session";
  if (originalToken === undefined) delete process.env.BACKEND_API_TOKEN; else process.env.BACKEND_API_TOKEN = originalToken;
  if (originalUrl === undefined) delete process.env.BACKEND_URL; else process.env.BACKEND_URL = originalUrl;
});
function configure() { process.env.BACKEND_API_TOKEN = "fixture-token"; process.env.BACKEND_URL = "https://backend.test"; }
const context = (path = []) => ({ params: Promise.resolve({ path }) });

test("overview forwards filters, scopes identity to the session, and prevents caching", async () => {
  configure();
  const upstream = mock(async () => Response.json({ total: 0 })); globalThis.fetch = upstream;
  const response = await GET(new Request("https://app.test/api/overview?source=test&days=7&search=refund&page=2", { headers: { "X-User-Id": "forged" } }), context());
  expect(response.status).toBe(200);
  expect(upstream.mock.calls[0][0].href).toBe("https://backend.test/v1/overview?source=test&days=7&search=refund&page=2");
  expect(upstream.mock.calls[0][1].headers["X-User-Id"]).toBe("owner-from-session");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
test("events remain a stream and inherit the request cancellation signal", async () => {
  configure();
  const upstream = mock(async () => new Response('event: change\ndata: {"revision":"1:1"}\n\n', { headers: { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" } })); globalThis.fetch = upstream;
  const controller = new AbortController();
  const response = await GET(new Request("https://app.test/api/overview/events", { signal: controller.signal }), context(["events"]));
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  expect(await response.text()).toContain("event: change");
  controller.abort(); expect(upstream.mock.calls[0][1].signal.aborted).toBe(true);
});
test("blocks anonymous access, unlisted paths and cross-origin resolution changes", async () => {
  configure(); const upstream = mock(); globalThis.fetch = upstream;
  userId = null;
  expect((await GET(new Request("https://app.test/api/overview"), context())).status).toBe(401);
  expect((await GET(new Request("https://app.test/api/overview"), context(["..", "agents"]))).status).toBe(404);
  expect((await PATCH(new Request("https://app.test/api/overview/conversations/00000000-0000-0000-0000-000000000000", { method: "PATCH", headers: { Origin: "https://evil.test" }, body: "{}" }), context(["conversations", "00000000-0000-0000-0000-000000000000"]))).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
test("trend fills empty dates without inventing activity and preserves outcome totals", () => {
  const empty = trendData([], 7); const today = empty.at(-1).day;
  const result = trendData([{ day: today, status: "resolved", count: 2 }, { day: today, status: "needs_clarification", count: 1 }], 7);
  expect(result.length).toBe(7); expect(result[0].resolved).toBe(0);
  expect(result.at(-1).resolved).toBe(2); expect(result.at(-1).other).toBe(1);
  expect(responseTime(null)).toBe("—"); expect(responseTime(1300)).toBe("1.3 s");
});
