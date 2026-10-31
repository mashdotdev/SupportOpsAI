"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  IoDocumentTextOutline,
  IoEyeOffOutline,
  IoSpeedometerOutline,
} from "react-icons/io5";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const PROBLEMS = [
  {
    category: "01 / Ungrounded retrieval",
    title: "Unsupported answers",
    description:
      "When evidence is missing or ambiguous, generic agents invent return policies and compliance commitments rather than stating uncertainty.",
    failure: "Drift",
    example: "Fabricated 30-day refund window without grounding citation.",
    icon: IoDocumentTextOutline,
  },
  {
    category: "02 / Black-box workflows",
    title: "Invisible decisions",
    description:
      "Support engineering teams cannot inspect why an agent selected a tool, what parameters it passed, or which source document triggered an action.",
    failure: "Failure",
    example: "Unvalidated write call to production billing database.",
    icon: IoEyeOffOutline,
  },
  {
    category: "03 / Blind deployments",
    title: "Unmeasured quality",
    description:
      "A cherry-picked prompt demo does not prove production readiness. Teams ship prompt revisions with zero regression testing on edge cases.",
    failure: "Gap",
    example: "0 automated tests run prior to deploying model upgrade.",
    icon: IoSpeedometerOutline,
  },
];

export const ProblemSection = () => {
  const cardsRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = cardsRef.current;
      if (!container) return;

      const media = gsap.matchMedia();
      media.add(
        "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
        () => {
          const cards = Array.from(
            container.querySelectorAll<HTMLElement>("[data-problem-card]"),
          );
          gsap.fromTo(
            cards,
            {
              y: 40,
              autoAlpha: 0,
            },
            {
              y: 0,
              autoAlpha: 1,
              duration: 0.8,
              stagger: 0.15,
              ease: "power3.out",
              scrollTrigger: {
                trigger: container,
                start: "top center",
                toggleActions: "play none none none",
                invalidateOnRefresh: true,
              },
            },
          );
        },
      );

      return () => media.revert();
    },
    { scope: cardsRef },
  );

  return (
    <section className="min-h-[50svh] overflow-hidden relative py-16 flex flex-col container mx-auto px-4 xl:px-0">
      <div className="">
        <p className="text-my-blue">{"//"} THE PROBLEM</p>
        {/*<h2 className="text-[clamp(2rem,8vw,3.5rem)] lg:text-[clamp(2.25rem,5.6vw,7rem)] font-semibold leading-none tracking-tight">
          Fluent answers aren&apos;t enough.
        </h2>*/}
        <p className="max-w-2xl sm:text-base lg:text-xl 2xl:text-2xl mt-4 font-satoshi font-semibold">
          Standard LLMs sound authoritative even when they invent corporate
          policy, misuse APIs, or hallucinate answers that cost customers trust
          and money.
        </p>
      </div>

      {/*bottom*/}
      <div ref={cardsRef} className="relative isolate mt-12 w-full">
        {PROBLEMS.map((problem, index) => {
          const Icon = problem.icon;

          return (
            <article
              key={problem.title}
              data-problem-card
              className="relative grid min-w-0 grid-cols-1 gap-8 border-t border-my-blue/70 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[0.35fr_1.2fr_1.3fr] lg:items-center lg:gap-12 lg:py-12"
            >
              <div className="flex items-center gap-3 self-start text-lg font-medium text-my-black">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon aria-hidden="true" className="size-4" />
              </div>
              <div
                aria-hidden="true"
                className="flex min-h-24 min-w-0 items-center justify-center  text-[9px] uppercase text-my-black sm:min-h-32"
              >
                {index === 0 ? (
                  <div className="flex w-full max-w-sm items-center">
                    <span>Question</span>
                    <span className="h-px flex-1 bg-my-black/25" />
                    <span className="flex size-11 shrink-0 items-center justify-center border border-my-black/25 text-sm text-my-blue">
                      ?
                    </span>
                    <span className="flex-1 border-t border-dashed border-my-black/25" />
                    <span>Answer</span>
                  </div>
                ) : index === 1 ? (
                  <div className="flex w-full max-w-sm items-center gap-4">
                    <span>Model</span>
                    <div className="flex h-16 w-20 items-center justify-center gap-2 border border-my-black/20">
                      <span className="h-7 w-1 bg-my-black/30" />
                      <span className="h-5 w-1 bg-my-blue" />
                      <span className="h-7 w-1 bg-my-black/30" />
                    </div>
                    <span className="h-px w-5 bg-my-black/25" />
                    <span className="flex size-12 items-center justify-center border border-my-white/25 leading-tight text-my-blue">
                      Black
                      <br />
                      box
                    </span>
                  </div>
                ) : (
                  <div className="flex h-20 w-full max-w-sm items-end gap-1.5 border-b border-my-white/25 pb-4">
                    {[10, 20, 14, 28, 17, 24, 10, 21, 14, 29, 18, 22].map(
                      (height, barIndex) => (
                        <span
                          key={barIndex}
                          style={{ height }}
                          className={`min-w-0 flex-1 ${barIndex === 3 || barIndex === 7 ? "bg-my-blue" : "bg-my-black/25"}`}
                        />
                      ),
                    )}
                    <span className="self-center text-my-blue">?</span>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase leading-relaxed text-my-blue sm:text-sm">
                  {problem.category}
                </p>
                <h3 className="mt-3 text-2xl font-semibold leading-tight text-my-black">
                  {problem.title}
                </h3>
                <p className="mt-4 text-sm font-satoshi leading-relaxed text-my-black/60 sm:text-base lg:text-lg">
                  {problem.description}
                </p>
                <div className="mt-5 flex items-center rounded border border-my-black/50 border-dashed px-4 py-4 font-mono text-sm leading-relaxed text-[#7b8794]">
                  <p>
                    <span className="font-semibold text-[#f06464]">
                      <span aria-hidden="true">× </span>
                      {problem.failure}:{" "}
                    </span>
                    {problem.example}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
