export type FormMode =
  "sign-in" | "sign-up" | "forgot-password" | "reset-password";
export type AuthValues = { name: string; email: string; password: string };
type Result = { data?: unknown; error?: { message?: string } | null };

// Keep the SDK boundary separate from the form's presentation.
export interface FormAuthClient {
  signIn: {
    email: (input: { email: string; password: string }) => Promise<Result>;
  };
  signUp: {
    email: (input: AuthValues & { callbackURL: string }) => Promise<Result>;
  };
  requestPasswordReset: (input: {
    email: string;
    redirectTo: string;
  }) => Promise<Result>;
  resetPassword: (input: {
    newPassword: string;
    token: string;
  }) => Promise<Result>;
}

export function validateAuthValues(mode: FormMode, values: AuthValues) {
  const errors: Partial<Record<keyof AuthValues, string>> = {};
  if (mode === "sign-up" && !values.name.trim())
    errors.name = "Enter your name.";
  if (
    mode !== "reset-password" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())
  )
    errors.email = "Enter a valid email address.";
  if (mode !== "forgot-password") {
    if (!values.password) errors.password = "Enter your password.";
    else if (mode !== "sign-in" && values.password.length < 8)
      errors.password = "Use at least 8 characters.";
  }
  return errors;
}

export function authErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Something went wrong. Please try again.";
}

export async function submitAuthForm(
  client: FormAuthClient,
  mode: FormMode,
  values: AuthValues,
  origin: string,
  token?: string | null,
): Promise<{ redirect?: string; message?: string }> {
  const email = values.email.trim();
  let result: Result;
  switch (mode) {
    case "sign-in":
      result = await client.signIn.email({ email, password: values.password });
      break;
    case "sign-up":
      result = await client.signUp.email({
        ...values,
        name: values.name.trim(),
        email,
        callbackURL: `${origin}/auth/callback`,
      });
      break;
    case "forgot-password":
      result = await client.requestPasswordReset({
        email,
        redirectTo: `${origin}/auth/reset-password`,
      });
      break;
    case "reset-password":
      if (!token || token === "INVALID_TOKEN")
        throw new Error("This reset link is invalid. Request a new one.");
      result = await client.resetPassword({
        newPassword: values.password,
        token,
      });
      break;
  }
  if (result.error)
    throw new Error(
      result.error.message ||
        "Unable to complete this request. Please try again.",
    );
  if (mode === "forgot-password")
    return {
      message:
        "If an account exists for this email, you’ll receive a password reset link.",
    };
  if (mode === "reset-password")
    return { redirect: "/auth/sign-in?reset=success" };
  if (
    mode === "sign-up" &&
    !(
      result.data &&
      typeof result.data === "object" &&
      "token" in result.data &&
      result.data.token
    )
  )
    return {
      message:
        "Your account has been created. Check your email for verification instructions, then sign in.",
    };
  return { redirect: "/workspace" };
}
