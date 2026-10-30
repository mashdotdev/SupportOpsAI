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
        { backgroundColor: "#0a0a0a" },
        {
          backgroundColor: "#f1f2ea",
          duration: 1,
        },
      )
        .fromTo(
          "[data-change-color]",
          { color: "#fafaf8" },
          { color: "#0a0a0a" },
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
      className="relative min-h-fit py-16 text-[#0a0a0a] sm:py-20 lg:py-24"
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
          <p className="mt-4 max-w-sm font-satoshi text-sm leading-relaxed text-black/55">
            SupportOps treats reliability as an engineering system—not a prompt
            that happens to work in a demo.
          </p>
          <div className="dark mt-9 max-w-md rounded-lg bg-background shadow-xl">
            <CodeBlock size="default">
              <CodeBlockHeader className="border-b border-border pb-3">
                <CodeBlockTitle>run_trace.json</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton value={RUN_TRACE} />
                </CodeBlockActions>
              </CodeBlockHeader>
              <CodeBlockContent
                className="min-h-64"
                aria-label="Example run trace JSON"
              >
                {RUN_TRACE}
              </CodeBlockContent>
              <CodeBlockFooter className="border-t border-border pt-3">
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
        <ol data-change-opacity className="min-w-0 border-t border-black/15">
          {CAPABILITIES.map((capability, index) => (
            <li
              key={capability.title}
              className="grid grid-cols-[20px_1fr_auto] items-start gap-4 border-b border-black/15 py-7 sm:gap-6 sm:py-8"
            >
              <span className="pt-1 font-mono text-[9px] text-black/45">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-satoshi text-base font-semibold tracking-tight">
                  {capability.title}
                </h3>
                <p className="mt-2 font-satoshi text-xs leading-relaxed text-black/55 sm:text-sm">
                  {capability.description}
                </p>
              </div>
              <ArrowUpRight
                aria-hidden="true"
                className="size-3 self-center text-black/35"
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
