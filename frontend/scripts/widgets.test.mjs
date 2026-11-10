import { afterEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

let owner = "owner-session";
mock.module("server-only", () => ({}));
mock.module("../src/lib/auth/server.ts", () => ({
  auth: {
    getSession: async () => ({ data: owner ? { user: { id: owner } } : null }),
  },
}));
const publicAPI = await import("../src/app/api/widget/[...path]/route.ts");
const ownerAPI = await import("../src/app/api/widgets/[[...path]]/route.ts");
const { completeWidgetTurn } = await import("../src/lib/widget-client.ts");
const originalFetch = globalThis.fetch;
const originalEnv = {
  BACKEND_URL: process.env.BACKEND_URL,
  BACKEND_API_TOKEN: process.env.BACKEND_API_TOKEN,
  WIDGET_CLIENT_IP_HEADER: process.env.WIDGET_CLIENT_IP_HEADER,
  WIDGET_PUBLIC_ORIGIN: process.env.WIDGET_PUBLIC_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
};
const id = "12345678-1234-1234-1234-123456789abc";
const context = (...path) => ({ params: Promise.resolve({ path }) });

test("committed answers display without a history request, and retries do not duplicate turns", () => {
  const result = { id, text: "Refunds within 30 days.", response_type: "answer",
    conversation_id: "conversation", conversation_status: "answered" };
  const state = completeWidgetTurn(null, result, "Refund policy?");
  expect(state.turns[0].answer).toBe(result.text);
  expect(state.status).toBe("answered");
  const replay = completeWidgetTurn(state, result, "Refund policy?");
  expect(replay.turns).toHaveLength(1);
  const escalation = completeWidgetTurn(state, { ...result, id: "second", response_type: "escalation",
    conversation_status: "needs_attention", text: "Contact support." }, "Help");
  expect(escalation.status).toBe("needs_attention");
  expect(escalation.notification_status).toBeNull();
  expect(escalation.turns).toHaveLength(2);
  expect(() => completeWidgetTurn(state, { text: "incomplete" }, "Help")).toThrow();
});
function configure() {
  process.env.BACKEND_URL = "https://backend.test";
  process.env.BACKEND_API_TOKEN = "private-service-token";
  delete process.env.WIDGET_CLIENT_IP_HEADER;
  delete process.env.WIDGET_PUBLIC_ORIGIN;
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  owner = "owner-session";
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("visitor transport works without owner login and forwards only scoped credentials", async () => {
  configure();
  owner = null;
  const upstream = mock(async () => Response.json({ turns: [] }));
  globalThis.fetch = upstream;
  const response = await publicAPI.GET(
    new Request(`https://app.test/api/widget/${id}/conversation`, {
      headers: {
        "X-Widget-Session": "visitor-token",
        "X-Widget-Site-Origin": "https://shop.test",
        Authorization: "forged-admin",
        "X-User-Id": "forged-owner",
        "X-Widget-Client-IP": "forged-ip",
      },
    }),
    context(id, "conversation"),
  );
  expect(response.status).toBe(200);
  const [url, init] = upstream.mock.calls[0];
  expect(url).toBe(`https://backend.test/v1/public/widgets/${id}/conversation`);
  expect(init.headers.get("X-Widget-Service-Token")).toBe(
    "private-service-token",
  );
  expect(init.headers.get("X-Widget-Session")).toBe("visitor-token");
  expect(init.headers.get("X-User-Id")).toBeNull();
  expect(init.headers.get("Authorization")).toBeNull();
  expect(init.headers.get("X-Widget-Client-IP")).toBe("shared");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.text()).not.toContain("private-service-token");
});

test("public path and method allowlists cannot reach management routes", async () => {
  configure();
  const upstream = mock();
  globalThis.fetch = upstream;
  for (const path of [
    [id, "publish"],
    [id, "config", "extra"],
    ["../../agents", "config"],
  ]) {
    expect(
      (
        await publicAPI.GET(
          new Request("https://app.test/api/widget/test"),
          context(...path),
        )
      ).status,
    ).toBe(404);
  }
  expect(
    (
      await publicAPI.POST(
        new Request("https://app.test/api/widget/test", { method: "POST" }),
        context(id, "config"),
      )
    ).status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});

test("public mutations require iframe origin and enforce bounded request bodies", async () => {
  configure();
  const upstream = mock();
  globalThis.fetch = upstream;
  expect(
    (
      await publicAPI.POST(
        new Request("https://app.test/api/widget/test", {
          method: "POST",
          headers: { Origin: "https://evil.test" },
          body: "{}",
        }),
        context(id, "sessions"),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await publicAPI.POST(
        new Request("https://app.test/api/widget/test", {
          method: "POST",
          headers: { Origin: "https://app.test" },
          body: "x".repeat(20001),
        }),
        context(id, "messages"),
      )
    ).status,
  ).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

test("tunnel mutations accept only the explicitly configured public origin", async () => {
  configure();
  process.env.WIDGET_PUBLIC_ORIGIN = "https://widget-tunnel.test";
  const upstream = mock(async () => Response.json({ token: "visitor-token" }));
  globalThis.fetch = upstream;
  const request = (origin) => new Request(`http://localhost:3000/api/widget/${id}/sessions`, {
    method: "POST",
    headers: {
      ...(origin ? { Origin: origin } : {}),
      "X-Forwarded-Host": "evil.test",
      "X-Forwarded-Proto": "https",
      "X-Widget-Site-Origin": "https://shop.test",
    },
    body: "{}",
  });
  for (const origin of [undefined, "null", "https://evil.test", "https://shop.test", "https://widget-tunnel.test.evil.test"]) {
    expect((await publicAPI.POST(request(origin), context(id, "sessions"))).status).toBe(403);
  }
  expect(upstream).not.toHaveBeenCalled();
  expect((await publicAPI.POST(request("https://widget-tunnel.test"), context(id, "sessions"))).status).toBe(200);
  expect(upstream.mock.calls[0][1].headers.get("X-Widget-Site-Origin")).toBe("https://shop.test");
});

test("development tunnels can rewrite Origin to loopback HTTP but production cannot", async () => {
  configure();
  const upstream = mock(async () => Response.json({ ok: true }));
  globalThis.fetch = upstream;
  const request = (host = "localhost:3000", origin = "http://localhost:3000") =>
    new Request(`https://${host}/api/widget/${id}/sessions`, {
      method: "POST", headers: { Origin: origin }, body: "{}",
    });
  process.env.NODE_ENV = "development";
  expect((await publicAPI.POST(request(), context(id, "sessions"))).status).toBe(200);
  expect((await publicAPI.POST(request("app.test"), context(id, "sessions"))).status).toBe(403);
  expect((await publicAPI.POST(request("localhost:3000", "http://localhost:3001"), context(id, "sessions"))).status).toBe(403);
  process.env.NODE_ENV = "production";
  expect((await publicAPI.POST(request(), context(id, "sessions"))).status).toBe(403);
});

test("public streaming preserves retry status and never follows provider redirects", async () => {
  configure();
  const upstream = mock(
    async () =>
      new Response('{"error":"busy"}', {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
  );
  globalThis.fetch = upstream;
  const response = await publicAPI.POST(
    new Request("https://app.test/api/widget/test", {
      method: "POST",
      headers: { Origin: "https://app.test" },
      body: "{}",
    }),
    context(id, "messages"),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("60");
  expect(upstream.mock.calls[0][1].redirect).toBe("error");
});

test("publishing uses authenticated owner and the correct backend route", async () => {
  configure();
  const upstream = mock(async () => Response.json({ widget: {} }));
  globalThis.fetch = upstream;
  expect(
    (
      await ownerAPI.POST(
        new Request("https://app.test/api/widgets/publish", {
          method: "POST",
          headers: { Origin: "https://app.test", "X-User-Id": "forged" },
          body: '{"version":1}',
        }),
        context("publish"),
      )
    ).status,
  ).toBe(200);
  const [url, init] = upstream.mock.calls[0];
  expect(String(url)).toBe("https://backend.test/v1/widgets/publish");
  expect(init.headers["X-User-Id"]).toBe("owner-session");
  owner = null;
  expect(
    (await ownerAPI.GET(new Request("https://app.test/api/widgets"), context()))
      .status,
  ).toBe(401);
});

test("launcher waits for a verified iframe handshake before posting messages", () => {
  const posts = [];
  const elements = {};
  let onMessage;
  const contentWindow = { postMessage: (...args) => posts.push(args) };
  const element = (tag) => {
    const attributes = {};
    const listeners = {};
    const result = {
      style: {},
      contentWindow: tag === "iframe" ? contentWindow : undefined,
      setAttribute: (name, value) => { attributes[name] = value; },
      getAttribute: (name) => attributes[name],
      addEventListener: (name, fn) => { listeners[name] = fn; },
      attachShadow: () => ({ append() {} }),
      focus() {},
      click: () => listeners.click(),
    };
    elements[tag] = result;
    return result;
  };
  runInNewContext(readFileSync(new URL("../public/widget.js", import.meta.url), "utf8"), {
    URL,
    document: {
      currentScript: { src: "https://app.test/widget.js", getAttribute: () => id },
      getElementById: () => null,
      createElement: element,
      body: { append() {} },
    },
    window: { addEventListener: (_name, fn) => { onMessage = fn; } },
    localStorage: { getItem: () => "" },
  });
  elements.button.click();
  expect(posts).toHaveLength(0);
  const data = { type: "supportops:ready", widgetId: id };
  onMessage({ origin: "https://shop.test", source: contentWindow, data });
  onMessage({ origin: "https://app.test", source: {}, data });
  expect(posts).toHaveLength(0);
  onMessage({ origin: "https://app.test", source: contentWindow, data });
  expect(posts).toHaveLength(1);
  expect(posts[0][0].type).toBe("supportops:init");
  expect(posts[0][0].open).toBe(true);
  expect(posts[0][1]).toBe("https://app.test");
});
