import Link from "next/link";
import { IoArrowUpOutline } from "react-icons/io5";

export const Hero = () => {
  return (
    <section className="relative min-h-svh">
      <div className="flex h-svh flex-col">
        {/*top*/}
        <div
          aria-labelledby="hero-title"
          className="relative flex flex-1 items-center pt-6 pb-10 sm:pt-8 sm:pb-16 lg:pt-12"
        >
          <div className="mx-auto flex w-full flex-col justify-between gap-8 lg:flex-row lg:gap-12">
            <div className="min-w-0 lg:flex-[2.1]">
              <div className="mb-6 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-black/10 px-3 py-1.5 font-mono text-[8px] uppercase tracking-wide sm:mb-8 sm:text-[9px] lg:mb-9">
                <span className="size-1.5 shrink-0 rounded-full bg-[#7DBBC3]" />
                <span className="text-[#7DBBC3]">
                  AI support infrastructure
                </span>
                <span aria-hidden="true" className="text-[#FAF5EF]">
                  ·
                </span>
                <span className="text-[#FAF5EF]">Built for reliability</span>
              </div>
              <h1
                id="hero-title"
                className="text-[clamp(2rem,8vw,3.5rem)] leading-[1.02] font-bold tracking-[-0.045em] text-[#FAF5EF] lg:text-[clamp(2.5rem,5.6vw,7rem)]"
              >
                Answers grounded in evidence.
              </h1>
              <h2 className="mt-1 text-[clamp(2rem,8vw,3.5rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-[#7DBBC3] lg:text-[clamp(2.25rem,5.6vw,7rem)]">
                Agents built for action.
              </h2>
            </div>
            <div className="flex w-full min-w-0 max-w-lg flex-col justify-end lg:flex-1 lg:pb-0.5">
              <p className="text-sm leading-relaxed text-[#FAF5EF]/75 sm:text-base">
                Give your AI support agent the knowledge, controlled tools, and
                continuous evaluation loop it needs to resolve high-stakes
                customer questions with certainty.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <Link
                  href="#demo"
                  className="inline-flex min-h-10 items-center justify-center gap-3 rounded-lg bg-[#7DBBC3] px-4 py-2.5 text-xs font-semibold text-[#0a0a0a] transition-colors hover:bg-[#96c9cf] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7DBBC3]"
                >
                  Explore the live demo
                  <IoArrowUpOutline
                    aria-hidden="true"
                    className="size-3.5 rotate-45"
                  />
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-black/15 px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7DBBC3]"
                >
                  See how it works
                </Link>
              </div>
              <ul className="mt-6 flex flex-wrap items-start gap-3 font-mono text-[10px] leading-tight text-[#626d7a] sm:gap-4">
                <li className="flex-1">
                  Grounded
                  <br />
                  retrieval
                </li>
                <li className="flex flex-1 gap-3 before:text-black/20 before:content-['/'] sm:gap-4">
                  <span>
                    Controlled tool
                    <br />
                    use
                  </span>
                </li>
                <li className="flex flex-1 gap-3 before:text-black/20 before:content-['/'] sm:gap-4">
                  <span>
                    Measurable
                    <br />
                    quality
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/*bottom*/}
        <div className="min-h-48 flex-2"></div>
      </div>
    </section>
  );
};
