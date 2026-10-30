"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useRef } from "react";
import Link from "next/link";
import { NAV_ITEMS } from "@/lib/navigation";

gsap.registerPlugin(ScrollTrigger, SplitText);

export const Footer = () => {
  const footerRoot = useRef<HTMLDivElement>(null);
  const footerHeading = useRef<HTMLHeadingElement>(null);

  useGSAP(
    () => {
      const splitedText = SplitText.create(footerHeading.current, {
        type: "chars",
        autoSplit: true,
        mask: "chars",
      });

      gsap.from(splitedText.chars, {
        yPercent: 100,
        stagger: {
          each: 0.03,
          from: "center",
        },
        duration: 1,
        scrollTrigger: {
          trigger: footerRoot.current,
          start: "top center",
          markers: true,
        },
      });
    },
    { scope: footerRoot, revertOnUpdate: true },
  );

  return (
    <footer
      ref={footerRoot}
      className="bg-[#0a0a0a] text-my-white py-16 relative overflow-hidden [container-type:inline-size]"
    >
      <div className="container mx-auto flex w-full flex-col px-4 pb-16 sm:pb-24 xl:px-0">
        <div className="grid gap-12 border-t border-my-white/15 pt-10 md:grid-cols-2 md:gap-16">
          <div className="max-w-md">
            <Link
              href="/"
              aria-label="SupportOps AI home"
              className="inline-flex min-h-11 items-center gap-2 text-2xl font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-my-blue"
            >
              SupportOps <span className="text-my-blue">AI</span>
            </Link>
            <p className="mt-5 max-w-sm font-satoshi text-sm leading-7 text-my-white/60 sm:text-base">
              AI support grounded in evidence. Bring knowledge, controlled
              actions, and continuous evaluation together to build agents your
              team can understand and trust.
            </p>
          </div>
          <nav
            aria-label="Footer navigation"
            className="md:justify-self-end md:min-w-72"
          >
            <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.16em] text-my-white/40">
              Explore the system
            </p>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:gap-x-12">
              {NAV_ITEMS.map((item) => (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-11 items-center font-satoshi text-sm capitalize transition-colors hover:text-my-blue focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-my-blue"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <h2
        ref={footerHeading}
        className="w-full whitespace-nowrap text-center text-[15.5cqw] leading-none tracking-tight opacity-50"
      >
        SupportOps AI
      </h2>
    </footer>
  );
};
