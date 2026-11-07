import { afterEach, expect, mock, test } from "bun:test";

let userId = "session-owner";
mock.module("server-only", () => ({}));
mock.module("../src/lib/auth/server.ts", () => ({
  auth: {
    getSession: async () => ({
      data: userId ? { user: { id: userId } } : null,
    }),
  },
}));
const { GET, PUT, POST, DELETE } =
  await import("../src/app/api/integrations/[[...path]]/route.ts");
const originalFetch = globalThis.fetch;
const token = process.env.BACKEND_API_TOKEN;
const backend = process.env.BACKEND_URL;
const context = (...path) => ({ params: Promise.resolve({ path }) });
afterEach(() => {
  globalThis.fetch = originalFetch;
  userId = "session-owner";
  if (token === undefined) delete process.env.BACKEND_API_TOKEN;
  else process.env.BACKEND_API_TOKEN = token;
  if (backend === undefined) delete process.env.BACKEND_URL;
  else process.env.BACKEND_URL = backend;
});
function configure() {
  process.env.BACKEND_API_TOKEN = "test-token";
  process.env.BACKEND_URL = "https://backend.test";
}
test("Slack settings use the authenticated owner and never cache credentials", async () => {
  configure();
  const upstream = mock(async () => Response.json({ connection: null }));
  globalThis.fetch = upstream;
  const response = await PUT(
    new Request("https://app.test/api/integrations/slack", {
      method: "PUT",
      headers: { Origin: "https://app.test", "X-User-Id": "forged" },
      body: JSON.stringify({ name: "Support", webhook_url: "fixture" }),
    }),
    context("slack"),
  );
  expect(response.status).toBe(200);
  expect(upstream.mock.calls[0][1].headers["X-User-Id"]).toBe("session-owner");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
test("restricts methods and paths, blocks anonymous and cross-origin mutations", async () => {
  configure();
  const upstream = mock();
  globalThis.fetch = upstream;
  expect(
    (
      await POST(
        new Request("https://app.test/api/integrations/history", {
          method: "POST",
        }),
        context("history"),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await GET(
        new Request("https://app.test/api/integrations/secret"),
        context("secret"),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await DELETE(
        new Request("https://app.test/api/integrations/slack", {
          method: "DELETE",
          headers: { Origin: "https://evil.test" },
        }),
        context("slack"),
      )
    ).status,
  ).toBe(403);
  userId = null;
  expect(
    (
      await GET(
        new Request("https://app.test/api/integrations/slack"),
        context("slack"),
      )
    ).status,
  ).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});
test("history forwards pagination and filters", async () => {
  configure();
  const upstream = mock(async () => Response.json({ jobs: [] }));
  globalThis.fetch = upstream;
  await GET(
    new Request(
      "https://app.test/api/integrations/history?source=test&status=simulated&page=2",
    ),
    context("history"),
  );
  expect(upstream.mock.calls[0][0].href).toBe(
    "https://backend.test/v1/integrations/history?source=test&status=simulated&page=2",
  );
});
