"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import {
  authErrorMessage,
  submitAuthForm,
  validateAuthValues,
  type AuthValues,
  type FormMode,
} from "@/lib/auth/form-actions";
import {
  AuthField,
  FormShell,
  SubmitButton,
  authLinkClass,
} from "@/components/auth/form-parts";

const copy = {
  "sign-in": {
    title: "Sign In",
    description: "Enter your email and password to sign in.",
    submit: "Sign In",
  },
  "sign-up": {
    title: "Sign Up",
    description: "Enter your information to create an account.",
    submit: "Create an account",
  },
  "forgot-password": {
    title: "Forgot Password",
    description: "Enter your email to receive a password reset link.",
    submit: "Send reset link",
  },
  "reset-password": {
    title: "Reset Password",
    description: "Choose a new password for your account.",
    submit: "Reset password",
  },
};

function CredentialForm({ mode }: { mode: FormMode }) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const invalidToken =
    mode === "reset-password" &&
    (!token || token === "INVALID_TOKEN" || Boolean(params.get("error")));
  const [errors, setErrors] = useState<
    Partial<Record<keyof AuthValues, string>>
  >({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const feedback = useRef<HTMLParagraphElement>(null);
  const labels = copy[mode];

  useEffect(() => {
    if (error || message) feedback.current?.focus();
  }, [error, message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: AuthValues = {
      name: String(data.get("name") || ""),
      email: String(data.get("email") || ""),
      password: String(data.get("password") || ""),
    };
    const nextErrors = validateAuthValues(mode, values);
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length) {
      form
        .querySelector<HTMLInputElement>(
          `[name="${Object.keys(nextErrors)[0]}"]`,
        )
        ?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const result = await submitAuthForm(
        authClient,
        mode,
        values,
        window.location.origin,
        token,
      );
      if (result.redirect) {
        router.replace(result.redirect);
        router.refresh();
      } else {
        form.reset();
        setMessage(result.message || "Request completed.");
        busy.current = false;
        setPending(false);
      }
    } catch (failure) {
      setError(authErrorMessage(failure));
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <FormShell
      title={labels.title}
      description={labels.description}
      signup={mode !== "sign-in"}
    >
      {invalidToken ? (
        <div className="flex flex-col gap-4 text-sm">
          <p role="alert">This reset link is invalid or has expired.</p>
          <Link className={authLinkClass} href="/auth/forgot-password">
            Request a new reset link
          </Link>
        </div>
      ) : message ? (
        <p
          ref={feedback}
          tabIndex={-1}
          role="status"
          className="text-sm leading-6 text-my-black"
        >
          {message}
        </p>
      ) : (
        <form
          onSubmit={submit}
          noValidate
          aria-busy={pending}
          className="flex flex-col gap-5.5"
        >
          {mode === "sign-in" && params.get("reset") === "success" && (
            <p role="status" className="text-sm text-my-black">
              Your password has been reset. Sign in with your new password.
            </p>
          )}
          {mode === "sign-up" && (
            <AuthField
              id="name"
              name="name"
              label="Name"
              placeholder="Your name"
              autoComplete="name"
              required
              disabled={pending}
              error={errors.name}
            />
          )}
          {mode !== "reset-password" && (
            <AuthField
              id="email"
              name="email"
              type="email"
              label="Email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={pending}
              error={errors.email}
            />
          )}
          {mode !== "forgot-password" && (
            <AuthField
              id="password"
              name="password"
              type="password"
              label={mode === "reset-password" ? "New password" : "Password"}
              placeholder="Enter your password"
              autoComplete={
                mode === "sign-in" ? "current-password" : "new-password"
              }
              required
              disabled={pending}
              error={errors.password}
              hint={
                mode === "sign-in"
                  ? undefined
                  : "Must be at least 8 characters."
              }
            />
          )}
          {mode === "sign-in" && (
            <Link
              href="/auth/forgot-password"
              className={`${authLinkClass} self-end text-sm`}
            >
              Forgot password?
            </Link>
          )}
          {error && (
            <p
              ref={feedback}
              tabIndex={-1}
              role="alert"
              className="text-sm leading-5 text-destructive"
            >
              {error}
            </p>
          )}
          {mode === "reset-password" && error && (
            <Link
              href="/auth/forgot-password"
              className={`${authLinkClass} text-sm`}
            >
              Request a new reset link
            </Link>
          )}
          <SubmitButton pending={pending}>{labels.submit}</SubmitButton>
        </form>
      )}
    </FormShell>
  );
}

export function SignInForm() {
  return <CredentialForm mode="sign-in" />;
}
export function SignUpForm() {
  return <CredentialForm mode="sign-up" />;
}
export function ForgotPasswordForm() {
  return <CredentialForm mode="forgot-password" />;
}
export function ResetPasswordForm() {
  return <CredentialForm mode="reset-password" />;
}

function SessionTransition({ signOut }: { signOut: boolean }) {
  const router = useRouter();
  const operation = useRef<Promise<string> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    operation.current ??= (async () => {
      if (signOut) {
        const result = await authClient.signOut();
        if (result.error) throw result.error;
        return "/auth/sign-in";
      }
      const result = await authClient.getSession();
      if (result.error) throw result.error;
      return result.data?.session ? "/workspace" : "/auth/sign-in";
    })();
    operation.current
      .then((destination) => {
        if (active) {
          router.replace(destination);
          router.refresh();
        }
      })
      .catch((failure) => {
        if (active) setError(authErrorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [router, signOut]);
  return (
    <FormShell
      title={signOut ? "Signing Out" : "Signing In"}
      description="Please wait while we update your session."
      signup
    >
      <p role={error ? "alert" : "status"} className="text-sm">
        {error || "Please wait…"}
      </p>
    </FormShell>
  );
}

export function AuthScreen({ path }: { path: string }) {
  switch (path) {
    case "sign-in":
      return <SignInForm key={path} />;
    case "sign-up":
      return <SignUpForm key={path} />;
    case "forgot-password":
      return <ForgotPasswordForm key={path} />;
    case "reset-password":
      return <ResetPasswordForm key={path} />;
    default:
      return <SessionTransition key={path} signOut={path === "sign-out"} />;
  }
}
