import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
const users = [];
function browser() {
  const cookies = new Map();
  return async (path, body) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Origin: base,
        Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") },
      body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  };
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await db.connect();
try {
  const anonymous = browser();
  const loginPage = await anonymous("/auth/sign-in");
  assert.equal(loginPage.status, 200);
  assert.ok(loginPage.data.includes("Sign In") || loginPage.data.includes("Sign in"));
  assert.equal((await anonymous("/api/tickets")).status, 401);
  assert.equal((await anonymous("/api/tickets", { subject: "Rejected" })).status, 401);
  assert.equal((await anonymous("/workspace")).status, 307);
  console.log("PASS: anonymous page and API access denied");

  const password = `Neon-test-${randomUUID()}!`;
  const email = `neon-e2e-${randomUUID()}@example.com`;
  users.push(email);
  const owner = browser();
  const signup = await owner("/api/auth/sign-up/email", { email, password, name: "Neon integration test" });
  assert.equal(signup.status, 200, `Signup failed: ${JSON.stringify(signup.data)}`);
  const session = await owner("/api/auth/get-session");
  assert.equal(session.data?.user?.email, email, "Signup did not establish a session (email verification may be required)");
  const workspace = await owner("/workspace");
  assert.equal(workspace.status, 200);
  assert.ok(workspace.data.includes("Support workspace"));
  console.log("PASS: Neon Auth signup and cookie session");

  const subject = `End-to-end ticket ${randomUUID()}`;
  const created = await owner("/api/tickets", { subject });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const ticketId = created.data.ticket.id;
  const stored = await db.query("SELECT subject, user_id FROM support_tickets WHERE id = $1", [ticketId]);
  assert.equal(stored.rows[0].subject, subject);
  assert.equal(stored.rows[0].user_id, session.data.user.id);
  assert.ok((await owner("/api/tickets")).data.tickets.some(ticket => ticket.id === ticketId));
  assert.equal((await owner("/api/tickets", { subject: " " })).status, 400);
  console.log("PASS: authenticated ticket write/read, database persistence, input validation");

  assert.equal((await owner("/api/auth/sign-out", {})).status, 200);
  assert.equal((await owner("/api/tickets")).status, 401);
  const returning = browser();
  assert.equal((await returning("/api/auth/sign-in/email", { email, password })).status, 200);
  assert.equal((await returning("/api/auth/get-session")).data.user.email, email);
  assert.ok((await returning("/api/tickets")).data.tickets.some(ticket => ticket.id === ticketId));
  console.log("PASS: sign-out denies access; fresh sign-in restores session and persisted ticket");

  const otherEmail = `neon-e2e-${randomUUID()}@example.com`;
  users.push(otherEmail);
  const other = browser();
  assert.equal((await other("/api/auth/sign-up/email", { email: otherEmail, password, name: "Isolation test" })).status, 200);
  const isolated = await other("/api/tickets");
  assert.equal(isolated.status, 200);
  assert.equal(isolated.data.tickets.length, 0);
  console.log("PASS: second user cannot read first user's tickets");
} finally {
  for (const email of users) {
    await db.query('DELETE FROM support_tickets WHERE user_id IN (SELECT id::text FROM neon_auth."user" WHERE email = $1)', [email]);
    await db.query('DELETE FROM neon_auth."user" WHERE email = $1', [email]);
  }
  await db.end();
  console.log("Cleaned up integration-test users and tickets");
}
