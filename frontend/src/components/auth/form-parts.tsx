"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { cn } from "cn";

export const authLinkClass =
  "font-semibold text-my-blue underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-my-blue";

export function FormShell({
  title,
  description,
  children,
  signup = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  signup?: boolean;
}) {
  return (
    <main className="flex min-h-[calc(100svh-2rem)] items-center justify-center px-2 py-10 text-my-black scheme-light sm:px-6 sm:py-12 ">
      <section
        aria-labelledby="auth-heading"
        className="flex w-full max-w-90 flex-col gap-8"
      >
        <header className="flex flex-col gap-2.5 text-center">
          <h1
            id="auth-heading"
            className="text-2xl leading-8 font-medium tracking-tight text-my-black lg:text-5xl lg:leading-none"
          >
            {title}
          </h1>
          <p className="text-lg max-w-xs mx-auto leading-7 text-my-black/65">
            {description}
          </p>
        </header>
        {children}
        <p className="text-center font-satoshi text-lg leading-7 text-my-black/65">
          {signup ? "Already have an account? " : "Don’t have an account? "}
          <Link
            className={authLinkClass}
            href={signup ? "/auth/sign-in" : "/auth/sign-up"}
          >
            {signup ? "Sign In" : "Sign Up"}
          </Link>
        </p>
      </section>
    </main>
  );
}

export function AuthField({
  label,
  error,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  const password = props.type === "password";
  const descriptionId = `${props.id}-description`;
  return (
    <div className="flex flex-col gap-2" data-invalid={Boolean(error)}>
      <label
        htmlFor={props.id}
        className="text-[13px] font-medium text-my-black"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          type={password && visible ? "text" : props.type}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? descriptionId : undefined}
          className={cn(
            "h-12 w-full rounded-lg border border-transparent bg-my-black/5 px-3.5 text-base text-my-black outline-none placeholder:text-my-black/65 focus-visible:border-my-blue focus-visible:ring-2 focus-visible:ring-my-blue focus-visible:ring-offset-2 focus-visible:ring-offset-my-white disabled:opacity-55 aria-invalid:border-destructive",
            password && "pr-12",
          )}
        />
        {password && (
          <button
            type="button"
            disabled={props.disabled}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
            className="absolute top-0 right-0 flex size-12 items-center justify-center rounded-lg text-my-black/65 focus-visible:outline-2 focus-visible:outline-my-blue disabled:opacity-55"
          >
            {visible ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {(error || hint) && (
        <p
          id={descriptionId}
          className={cn(
            "text-[13px] leading-5",
            error ? "text-destructive" : "text-my-black/65",
          )}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-my-blue px-4 py-3 text-sm font-semibold text-my-white hover:bg-my-blue/90 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-my-blue disabled:cursor-not-allowed disabled:opacity-55"
    >
      {pending && (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      {pending ? "Please wait…" : children}
    </button>
  );
}
