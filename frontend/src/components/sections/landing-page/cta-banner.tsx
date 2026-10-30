import Link from "next/link";
import { IoArrowForward } from "react-icons/io5";

export const CTABannerSection = () => {
  return (
    <section className="min-h-[40svh] bg-my-blue">
      <div className="min-h-[40svh] container mx-auto flex flex-col px-4 py-16 sm:py-24 xl:px-0 items-center justify-center text-center text-my-white">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
          Ready to inspect the system?
        </p>
        <h2 className="mt-6 max-w-6xl font-satoshi text-[clamp(2.25rem,7vw,6.5rem)] font-medium leading-none tracking-tight">
          Build AI support you can
          <br className="hidden lg:block" /> actually{" "}
          <span className="underline decoration-1 underline-offset-8">
            evaluate.
          </span>
        </h2>
        <p className="mt-8 max-w-xl font-satoshi text-sm leading-relaxed sm:text-base">
          Explore how evidence, controlled actions, and repeatable evaluations
          fit into one support workflow.
        </p>
        <div className="mt-10 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
          <Link
            href="#demo"
            className="inline-flex min-h-12 items-center justify-center gap-6 bg-my-black px-6 py-3 font-satoshi text-sm font-semibold transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          >
            Explore the demo
            <IoArrowForward aria-hidden="true" className="size-4" />
          </Link>
          <Link
            href="#engineering"
            className="inline-flex min-h-12 items-center justify-center gap-4 border-b border-current py-3 font-satoshi text-sm transition-opacity hover:opacity-75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
          >
            Read the technical overview
            <IoArrowForward aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};
