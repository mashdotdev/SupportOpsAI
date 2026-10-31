import type { ReactNode } from "react";
import "../globals.css";
import Image from "next/image";
import localFont from "next/font/local";

const satoshi = localFont({
  src: "../fonts/satoshi-variable.woff2",
  variable: "--font-satoshi-family",
  weight: "300 900",
  style: "normal",
  display: "swap",
});

const ONBOARDING_STEPS = [
  "Sign up your account",
  "Set up your workspace",
  "Set up your AI Agent",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={satoshi.variable} suppressHydrationWarning>
      <body className="bg-my-white text-my-black">
        <div className="flex min-h-svh p-4">
          <div className="min-w-0 flex-1">{children}</div>
          <div className="flex-1 sticky top-4 h-[calc(100svh-2rem)] min-h-144 min-w-0 rounded-sm overflow-hidden hidden lg:block">
            <Image
              src={"/images/chicago.jpg"}
              alt=""
              fill
              sizes="50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
            <div className="relative flex h-full flex-col justify-end gap-10 p-6 text-white xl:gap-16 xl:p-12">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <h2 className="text-[clamp(2rem,3vw,3.5rem)] font-medium leading-tight tracking-tight">
                  Get Started
                  <br />
                  with Us
                </h2>
                <p className="max-w-52 text-sm leading-relaxed text-white/65 xl:text-base">
                  Complete these easy steps to register your account.
                </p>
              </div>
              <ol
                className="grid grid-cols-3 gap-3 xl:gap-4"
                aria-label="Registration steps"
              >
                {ONBOARDING_STEPS.map((step, index) => (
                  <li
                    key={step}
                    aria-current={index === 0 ? "step" : undefined}
                    className={`flex min-h-40 min-w-0 flex-col justify-between gap-7 rounded-2xl border p-4 xl:min-h-44 xl:p-6 ${index === 0 ? "border-white bg-white text-neutral-950 shadow-lg" : "border-white/10 bg-white/10 text-white/60 backdrop-blur-lg"}`}
                  >
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? "bg-neutral-950 text-white" : "bg-white/15 text-white/70"}`}
                    >
                      {index + 1}
                    </span>
                    <p className="text-sm font-medium leading-relaxed xl:text-lg">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
