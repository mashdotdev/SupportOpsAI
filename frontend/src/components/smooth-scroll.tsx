"use client";

import gsap from "gsap";
import { Lenis, LenisRef } from "lenis/react";
import { ReactNode, useEffect, useRef } from "react";

export const SmoothScroll = ({ children }: { children: ReactNode }) => {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    function update(time: number): void {
      lenisRef.current?.lenis?.raf(time * 1000);
    }

    gsap.ticker.add(update);

    return () => gsap.ticker.remove(update);
  }, []);

  return (
    <Lenis ref={lenisRef} root options={{ autoRaf: false }}>
      {children}
    </Lenis>
  );
};
