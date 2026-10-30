"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { IoMenu } from "react-icons/io5";

const NAV_ITEMS: NAV_ITEMS_TYPE = [
  { title: "product", href: "#" },
  { title: "how it works", href: "#" },
  { title: "evaluations", href: "#" },
  { title: "developers", href: "#" },
];

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const delay = sessionStorage.getItem("first-visit") ? 0.4 : 3;

    gsap.from(navRef.current, {
      delay,
      clipPath: "inset(0% 50% 0% 50%)",
      duration: 1,
      ease: "power3.inOut",
    });
  });

  return (
    <div
      ref={navRef}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))]  left-1/2 z-999 w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 overflow-hidden  bg-black/50 backdrop-blur-3xl  text-[#faf5ef] shadow-2xl shadow-[#3b2d28] lg:w-[85%] xl:w-[75%]"
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          setIsOpen(false);
          menuButtonRef.current?.focus();
        }
      }}
    >
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <p className="shrink-0 text-sm font-bold sm:text-base">
          SupportOps <span className="text-[#7DBBC3]">AI</span>
        </p>
        <nav
          aria-label="Main navigation"
          className="hidden items-center gap-4 lg:flex xl:gap-6"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="rounded-sm py-3 transition-colors hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#faf5ef]"
            >
              <span className="uppercase text-sm font-medium">
                {item.title}
              </span>
            </Link>
          ))}
        </nav>
        <button
          ref={menuButtonRef}
          type="button"
          aria-label={isOpen ? "Close menu" : "Open menu"}
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={() => setIsOpen((open) => !open)}
          className="flex size-11 shrink-0 cursor-pointer text-[#CCFF00] items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#faf5ef]"
        >
          <IoMenu aria-hidden="true" className="size-6" />
        </button>
      </div>
      <div
        id={menuId}
        inert={!isOpen}
        aria-hidden={!isOpen}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out motion-reduce:transition-none ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mx-4 border-t border-white/15 py-4 sm:mx-6">
            <nav
              aria-label="Mobile navigation"
              className="mb-4 grid grid-cols-2 gap-2 lg:hidden"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.title}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex min-h-11 items-center rounded-lg px-3 text-xs font-medium uppercase transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#faf5ef] sm:text-sm"
                >
                  {item.title}
                </Link>
              ))}
            </nav>
            <div className="flex flex-col gap-3 sm:flex-row">
              {["DEMO WORKSPACE", "Explore the demo"].map((label) => (
                <button
                  key={label}
                  type="button"
                  className="min-h-11 flex-1 cursor-pointer rounded-full border border-white/25 px-5 py-2 text-sm font-medium transition-colors hover:bg-[#CCFF00] hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#faf5ef]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
