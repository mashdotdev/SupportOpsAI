"use client";

import Link from "next/link";
import { IoArrowUpOutline } from "react-icons/io5";

import image1 from "@public/images/ana.jpg";
import image2 from "@public/images/ana2.jpg";
import image3 from "@public/images/ana3.jpg";
import image4 from "@public/images/ana4.jpg";
import Image, { StaticImageData } from "next/image";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLenis } from "lenis/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const IMAGES: StaticImageData[] = [image1, image2, image3, image4, image1];

export const Hero = () => {
  const [isAnimating, setIsAnimating] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(true);

  const root = useRef<HTMLDivElement | null>(null);
  const boxesRef = useRef<(HTMLDivElement | null)[]>([]);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);

  const lenis = useLenis();

  useEffect(() => {
    if (isAnimating && !sessionStorage.getItem("first-visit")) lenis?.stop();
    else lenis?.start();
  }, [lenis, isAnimating]);

  useGSAP(
    () => {
      const section = root.current!;
      const boxes = boxesRef.current.filter(
        (box): box is HTMLDivElement => box !== null,
      );
      const images = imagesRef.current.filter(
        (image): image is HTMLImageElement => image !== null,
      );

      if (sessionStorage.getItem("first-visit")) {
        gsap.to(images, {
          yPercent: 12,
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
        return;
      }

      const stage = section.getBoundingClientRect();
      const boxesRects = boxes.map((box) => box!.getBoundingClientRect());

      const startingWidth = Math.min(stage.width * 0.2, 300);
      const startingHeight = startingWidth * (4 / 3);
      const centerY = stage.top + (stage.height - startingHeight) / 2;
      const centerX = stage.left + (stage.width - startingWidth) / 2;

      gsap.set(boxes, {
        height: startingHeight,
        width: startingWidth,
        x: (index) => centerX - boxesRects[index].left,
        y: (index) => centerY - boxesRects[index].top,
        clipPath: "inset(100% 0% 0% 0%)",
      });

      const tl = gsap.timeline({
        delay: 0.3,
        onComplete: () => {
          gsap.set(boxes, {
            clearProps: "transform,height,width,clipPath",
          });
          sessionStorage.setItem("first-visit", "true");
          setIsFirstVisit(false);
          setIsAnimating(false);
        },
      });

      tl.to(boxes, {
        clipPath: "inset(0% 0% 0% 0%)",
        duration: 1,
        stagger: 0.2,
        ease: "power3.inOut",
      }).to(
        boxes,
        {
          x: 0,
          y: 0,
          height: (index) => boxesRects[index].height,
          width: (index) => boxesRects[index].width,
          duration: 1.5,
          stagger: 0.04,
          ease: "power3.inOut",
        },
        "+=0.5",
      );
    },
    { scope: root, revertOnUpdate: true, dependencies: [isFirstVisit] },
  );

  return (
    <section ref={root} className="relative min-h-svh hero-section">
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
        <div className="flex-2 flex flex-col lg:flex-row gap-[1svh]">
          {IMAGES.map((src, index) => (
            <div
              key={index}
              className="relative min-w-0 w-full aspect-3/4 flex-1 lg:max-w-[min(28vw,38svh)]"
            >
              <div
                ref={(el) => {
                  boxesRef.current[index] = el;
                }}
                className="absolute inset-0 overflow-hidden rounded-md"
              >
                <Image
                  ref={(el) => {
                    imagesRef.current[index] = el;
                  }}
                  priority
                  src={src}
                  alt=""
                  draggable={false}
                  className="size-full block object-cover scale-115"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
