"use client";

import Link from "next/link";
import { IoArrowUpOutline } from "react-icons/io5";

import image1 from "@public/images/row-1-column-1.png";
import image2 from "@public/images/row-1-column-2.png";
import image3 from "@public/images/row-1-column-3.png";

import Image, { StaticImageData } from "next/image";
import { useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useLenis } from "lenis/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const IMAGES: StaticImageData[] = [image1, image2, image3];

export const Hero = () => {
  const [isAnimating, setIsAnimating] = useState(true);
  const [isFirstVisit, setIsFirstVisit] = useState(true);

  const root = useRef<HTMLDivElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
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

      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const textElements = gsap.utils.toArray<HTMLElement>(
        "[data-hero-badge], h1, h2, p, a, li",
        topRef.current!,
      );
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const boxesRects = boxes.map((box) => box!.getBoundingClientRect());

      const startingWidth = Math.min(viewportWidth * 0.2, 300);
      const startingHeight = startingWidth * (4 / 3);
      // Match getBoundingClientRect's viewport coordinates, not the hero's height.
      const centerY =
        (viewport?.offsetTop ?? 0) + (viewportHeight - startingHeight) / 2;
      const centerX =
        (viewport?.offsetLeft ?? 0) + (viewportWidth - startingWidth) / 2;

      gsap.set(boxes, {
        height: startingHeight,
        width: startingWidth,
        x: (index) => centerX - boxesRects[index].left,
        y: (index) => centerY - boxesRects[index].top,
        clipPath: "inset(100% 0% 0% 0%)",
      });

      if (!reduceMotion) {
        gsap.set(textElements, { y: 40, autoAlpha: 0 });
      }

      const tl = gsap.timeline({
        delay: 0.3,
        onComplete: () => {
          gsap.set(boxes, {
            clearProps: "transform,height,width,clipPath",
          });
          gsap.set(textElements, {
            clearProps: "transform,opacity,visibility",
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
      });

      const offsetsX = [-16, 0, 16];

      tl.to(
        boxes,
        {
          x: (index) => offsetsX[index],
          y: 0,
          height: (index) => boxesRects[index].height,
          width: (index) => boxesRects[index].width,
          duration: 1.5,
          stagger: 0.04,
          ease: "power3.inOut",
        },
        "+=0.5",
      ).to(
        [boxes[0], boxes[2]],
        {
          x: 0,
          duration: 0.5,
        },
        "+=0.3",
      );

      if (!reduceMotion) {
        tl.to(
          textElements,
          {
            y: 0,
            autoAlpha: 1,
            duration: 0.8,
            stagger: 0.1,
            ease: "power3.out",
          },
          "<+=0.3",
        );
      }
    },
    { scope: root, revertOnUpdate: true, dependencies: [isFirstVisit] },
  );

  return (
    <section ref={root} className="relative min-h-svh hero-section">
      <div className="container mx-auto px-4 xl:px-0">
        <div className="flex min-h-svh flex-col">
          {/*top*/}
          <div
            ref={topRef}
            aria-labelledby="hero-title"
            className="relative flex flex-1 items-center pt-6 pb-10 sm:pt-8 sm:pb-16 lg:pt-12"
          >
            <div className="mx-auto flex w-full flex-col gap-8 lg:gap-12">
              <div className="w-full min-w-0">
                <div
                  data-hero-badge
                  className="mb-6 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-black/10 px-3 py-1.5 font-mono text-[8px] uppercase tracking-wide sm:mb-8 sm:text-[9px] lg:mb-9"
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-my-blue" />
                  <span className="text-my-blue text-sm">
                    AI support infrastructure
                  </span>
                  <span aria-hidden="true" className="text-my-black">
                    ·
                  </span>
                  <span className="text-my-black text-sm">
                    Built for reliability
                  </span>
                </div>
                <h1
                  id="hero-title"
                  className="text-[clamp(2rem,8vw,3.5rem)] leading-[1.02] font-medium tracking-[-0.045em] text-my-black lg:text-[clamp(2.5rem,5.6vw,7rem)]"
                >
                  Answers grounded <br /> in{" "}
                  <span className="text-my-blue">evidence</span>.
                </h1>
                <h2 className="mt-1 whitespace-nowrap text-[clamp(1rem,6vw,7rem)] leading-[1.02] font-medium tracking-[-0.045em]">
                  Agents built for action.
                </h2>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:pb-0.5">
                <p className="w-full min-w-0 text-sm leading-relaxed text-my-black/75 sm:text-base lg:max-w-lg lg:flex-1 font-satoshi">
                  Give your AI support agent the knowledge, controlled tools,
                  and continuous evaluation loop it needs to resolve high-stakes
                  customer questions with certainty.
                </p>
                <div className="flex w-full min-w-0 flex-col gap-6 lg:w-auto lg:shrink-0">
                  <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                    <Link
                      href="#demo"
                      className="inline-flex min-h-10 items-center justify-center gap-3 font-satoshi rounded-xs bg-my-blue px-4 py-2.5 text-xs font-semibold text-my-white transition-colors hover:bg-[#CCFF00]/75 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7DBBC3]"
                    >
                      Explore the live demo
                      <IoArrowUpOutline
                        aria-hidden="true"
                        className="size-3.5 rotate-45"
                      />
                    </Link>
                    <Link
                      href="#how-it-works"
                      className="inline-flex min-h-10 items-center justify-center font-satoshi rounded-xs border border-black/15 px-4 py-2.5 text-xs font-semibold transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7DBBC3]"
                    >
                      See how it works
                    </Link>
                  </div>
                  <ul className="flex w-full flex-wrap items-start gap-3 text-sm leading-tight text-[#626d7a] sm:gap-4">
                    <li className="flex-1">
                      Grounded
                      <br />
                      retrieval
                    </li>
                    <li className="flex flex-1 gap-3 before:text-black/20 before:content-['/'] sm:gap-4">
                      <span>
                        Controlled tool
                        <br />
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
          </div>

          {/*bottom*/}
          <div className="flex w-full flex-nowrap justify-center">
            {IMAGES.map((src, index) => (
              <div
                key={index}
                className="relative w-1/3 min-w-0 shrink-0"
                style={{
                  aspectRatio: "1115 / 1882",
                }}
              >
                <div
                  ref={(el) => {
                    boxesRef.current[index] = el;
                  }}
                  className="absolute inset-0 overflow-hidden"
                >
                  <Image
                    ref={(el) => {
                      imagesRef.current[index] = el;
                    }}
                    priority
                    sizes="33vw"
                    src={src}
                    alt=""
                    draggable={false}
                    className="size-full block object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
