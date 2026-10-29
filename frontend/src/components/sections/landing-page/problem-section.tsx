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
          const middle = cards[1];
          const outer = [cards[0], cards[2]];

          gsap.fromTo(
            outer,
            {
              x: (_, card: HTMLElement) => middle.offsetLeft - card.offsetLeft,
              scale: 0.94,
            },
            {
              x: 0,
              scale: 1,
              duration: 1.1,
              ease: "power3.inOut",
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
    <section className="min-h-[50svh] overflow-hidden relative py-16 flex flex-col">
      <div className="">
        <p className="text-[#7DBBC3] text-center">{"//"} 01 THE PROBLEM</p>
        <h2 className="text-center text-[clamp(2rem,8vw,3.5rem)] lg:text-[clamp(2.25rem,5.6vw,7rem)] font-semibold leading-none tracking-tight">
          Fluent answers aren&apos;t enough.
        </h2>
        <p className="text-center max-w-5xl mx-auto sm:text-base lg:text-xl mt-4">
          Standard LLMs sound authoritative even when they invent corporate
          policy, misuse APIs, or hallucinate answers that cost customers trust
          and money.
        </p>
      </div>

      {/*bottom*/}
      <div
        ref={cardsRef}
        className="relative isolate mt-12 grid w-full grid-cols-1 items-stretch gap-5 lg:h-[50svh] lg:grid-cols-3 lg:content-stretch lg:gap-7"
      >
        {PROBLEMS.map((problem, index) => {
          const Icon = problem.icon;

          return (
            <article
              key={problem.title}
              data-problem-card
              className={`relative flex min-w-0 flex-col rounded-2xl border border-[#7DBBC3]/50 bg-[#0a0a0a] p-6 sm:p-8 ${index === 1 ? "z-10" : "z-0"}`}
            >
              <div className="mb-7 flex size-12 items-center justify-center rounded-xl border border-white/[0.06] bg-[#181d21] text-[#FAF5EF]/85">
                <Icon aria-hidden="true" className="size-6" />
              </div>
              <p className="font-mono text-xs font-semibold uppercase leading-relaxed text-[#7DBBC3] sm:text-sm">
                {problem.category}
              </p>
              <h3 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-[#FAF5EF]">
                {problem.title}
              </h3>
              <p className="mt-4 mb-7 text-sm leading-7 text-[#929ca6] sm:text-base lg:text-lg">
                {problem.description}
              </p>
              <div className="mt-auto flex min-h-24 items-center rounded border border-white/[0.07] bg-[#080b0c] px-4 py-5 font-mono text-sm leading-relaxed text-[#7b8794] sm:text-base">
                <p>
                  <span className="font-semibold text-[#f06464]">
                    <span aria-hidden="true">× </span>
                    {problem.failure}:{" "}
                  </span>
                  {problem.example}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
