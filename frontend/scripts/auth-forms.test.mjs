import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  submitAuthForm,
  validateAuthValues,
  authErrorMessage,
} from "../src/lib/auth/form-actions.ts";

const values = {
  name: " Alex ",
  email: " alex@example.com ",
  password: "pass word 123",
};
const origin = "http://localhost:3000";
function fixture(result = { data: { token: "test-session" } }) {
  const calls = [];
  const method = (name) => async (input) => {
    calls.push({ name, input });
    return result;
  };
  return {
    calls,
    client: {
      signIn: { email: method("sign-in") },
      signUp: { email: method("sign-up") },
      requestPasswordReset: method("forgot-password"),
      resetPassword: method("reset-password"),
    },
  };
}

describe("custom authentication flows", () => {
  it("validates required fields without imposing new password rules on existing logins", () => {
    assert.deepEqual(
      validateAuthValues("sign-up", {
        name: " ",
        email: "bad",
        password: "short",
      }),
      {
        name: "Enter your name.",
        email: "Enter a valid email address.",
        password: "Use at least 8 characters.",
      },
    );
    assert.deepEqual(
      validateAuthValues("sign-in", { ...values, password: "old" }),
      {},
    );
    assert.deepEqual(
      validateAuthValues("forgot-password", { ...values, password: "" }),
      {},
    );
    assert.deepEqual(
      validateAuthValues("reset-password", { ...values, email: "" }),
      {},
    );
  });
  it("signs in with trimmed email and an unmodified password", async () => {
    const { client, calls } = fixture();
    assert.deepEqual(await submitAuthForm(client, "sign-in", values, origin), {
      redirect: "/workspace",
    });
    assert.deepEqual(calls[0].input, {
      email: "alex@example.com",
      password: values.password,
    });
  });
  it("creates accounts with the existing name and verification callback", async () => {
    const { client, calls } = fixture();
    assert.equal(
      (await submitAuthForm(client, "sign-up", values, origin)).redirect,
      "/workspace",
    );
    assert.deepEqual(calls[0].input, {
      name: "Alex",
      email: "alex@example.com",
      password: values.password,
      callbackURL: `${origin}/auth/callback`,
    });
  });
  it("keeps verification-required signups out of the workspace", async () => {
    const { client } = fixture({ data: { token: null } });
    const result = await submitAuthForm(client, "sign-up", values, origin);
    assert.equal(result.redirect, undefined);
    assert.match(result.message, /verification/);
  });
  it("requests recovery with a local reset destination and generic confirmation", async () => {
    const { client, calls } = fixture();
    assert.match(
      (await submitAuthForm(client, "forgot-password", values, origin)).message,
      /If an account exists/,
    );
    assert.deepEqual(calls[0].input, {
      email: "alex@example.com",
      redirectTo: `${origin}/auth/reset-password`,
    });
  });
  it("rejects missing and invalid reset tokens before calling Neon", async () => {
    const { client, calls } = fixture();
    for (const token of [undefined, "", "INVALID_TOKEN"])
      await assert.rejects(
        submitAuthForm(client, "reset-password", values, origin, token),
        /invalid/,
      );
    assert.equal(calls.length, 0);
  });
  it("resets a password and removes the sensitive token from the next URL", async () => {
    const { client, calls } = fixture();
    assert.deepEqual(
      await submitAuthForm(
        client,
        "reset-password",
        values,
        origin,
        "reset-token",
      ),
      { redirect: "/auth/sign-in?reset=success" },
    );
    assert.deepEqual(calls[0].input, {
      newPassword: values.password,
      token: "reset-token",
    });
  });
  for (const mode of [
    "sign-in",
    "sign-up",
    "forgot-password",
    "reset-password",
  ]) {
    it(`surfaces returned SDK errors for ${mode}`, async () => {
      const { client } = fixture({ error: { message: "Request rejected" } });
      await assert.rejects(
        submitAuthForm(client, mode, values, origin, "token"),
        /Request rejected/,
      );
    });
  }
  it("handles thrown network failures and unknown failures", async () => {
    const { client } = fixture();
    client.signIn.email = async () => {
      throw new Error("Network unavailable");
    };
    await assert.rejects(
      submitAuthForm(client, "sign-in", values, origin),
      /Network unavailable/,
    );
    assert.equal(
      authErrorMessage({ message: "Network unavailable" }),
      "Network unavailable",
    );
    assert.match(authErrorMessage(null), /try again/);
  });
});
