"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import React, { useRef } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ui/code-block";

const CAPABILITIES = [
  {
    title: "Retrieval-augmented generation",
    description: "Answers stay connected to approved company knowledge.",
  },
  {
    title: "Typed tool interfaces",
    description: "Every proposed action passes a server-side contract.",
  },
  {
    title: "Human escalation",
    description: "Low-confidence cases move to the right queue with context.",
  },
  {
    title: "Evaluation datasets",
    description: "Repeatable test cases make quality changes visible.",
  },
  {
    title: "Run traces and observability",
    description: "Inspect retrieval, reasoning steps, and execution outcomes.",
  },
  {
    title: "Latency and cost tracking",
    description: "Understand the operational shape of every answer.",
  },
];

const RUN_TRACE = JSON.stringify(
  {
    run_id: "run_84f2",
    evidence: { sources: 2, support: "verified" },
    action: null,
    latency_ms: 1420,
    escalated: false,
  },
  null,
  2,
);

gsap.registerPlugin(ScrollTrigger);

export const EngineeringSection = () => {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: "top center",
          toggleActions: "play none none reverse",
        },
      });

      tl.fromTo(
        document.body,
        { backgroundColor: "#f1f2ea" },
        {
          backgroundColor: "#0a0a0a",
          duration: 0.5,
        },
      )
        .fromTo(
          "[data-change-card-theme]",
          {
            "--card-surface": "#ffffff",
            "--card-secondary": "#f7f7f5",
            "--card-inset": "#eeeeeb",
            "--card-raised": "#e5e5e2",
            "--card-metric": "#f7f7f5",
            "--card-ink": "#171717",
            "--card-border": "rgba(0,0,0,0.12)",
          },
          {
            "--card-surface": "#141414",
            "--card-secondary": "#181818",
            "--card-inset": "#0a0a0a",
            "--card-raised": "#202020",
            "--card-metric": "#161616",
            "--card-ink": "#fafaf8",
            "--card-border": "rgba(250,250,248,0.2)",
            duration: 0.5,
          },
          "<",
        )
        .fromTo(
          "[data-change-color]",
          { color: "#0a0a0a" },
          { color: "#fafaf8" },
          "<",
        )
        .fromTo("[data-change-opacity]", { opacity: 0 }, { opacity: 1 }, "<");
    },
    { revertOnUpdate: true },
  );

  return (
    <section
      id="engineering"
      ref={root}
      className="relative min-h-fit py-16 text-my-white sm:py-20 lg:py-24"
    >
      <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-2 lg:gap-16 xl:gap-24 xl:px-0">
        <div data-change-opacity className="min-w-0">
          <p className="mb-5 uppercase text-my-blue">
            {"//"} Engineering first
          </p>
          <h2 className="max-w-2xl text-[clamp(2rem,3.5vw,3.5rem)] font-medium leading-[1.04] tracking-[-0.045em]">
            Designed to be inspected.
            <br />
            Built to be tested.
          </h2>
          <p className="mt-4 max-w-sm font-satoshi text-base leading-relaxed text-white/60">
            SupportOps treats reliability as an engineering system, not a prompt
            that happens to work in a demo.
          </p>
          <div className="mt-9 max-w-md rounded-lg shadow-xl">
            <CodeBlock size="default" className="border-my-white/15 bg-[#0a0a0a] text-my-white dark:bg-[#0a0a0a]">
              <CodeBlockHeader className="border-b border-my-white/15 pb-3 text-my-white">
                <CodeBlockTitle className="text-my-white">run_trace.json</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton value={RUN_TRACE} className="text-my-white hover:bg-my-white/10 hover:text-my-white" />
                </CodeBlockActions>
              </CodeBlockHeader>
              <CodeBlockContent
                className="min-h-64"
                aria-label="Example run trace JSON"
              >
                {RUN_TRACE}
              </CodeBlockContent>
              <CodeBlockFooter className="border-t border-my-white/15 pt-3 text-my-white">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-my-blue"
                />
                <span className="font-mono text-[9px] uppercase tracking-wider">
                  Trace complete
                </span>
              </CodeBlockFooter>
            </CodeBlock>
          </div>
        </div>
        <ol data-change-opacity className="min-w-0 border-t border-my-white/50">
          {CAPABILITIES.map((capability, index) => (
            <li
              key={capability.title}
              className="grid grid-cols-[20px_1fr_auto] items-start gap-4 border-b border-my-white/50 py-7 sm:gap-6 sm:py-8"
            >
              <span className="pt-1 text-sm  text-my-white/60">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-satoshi text-lg font-semibold tracking-tight">
                  {capability.title}
                </h3>
                <p className="mt-2 font-satoshi text-xs leading-relaxed text-my-white/55 sm:text-base">
                  {capability.description}
                </p>
              </div>
              <ArrowUpRight
                aria-hidden="true"
                className="size-6 self-center text-my-white/50"
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
