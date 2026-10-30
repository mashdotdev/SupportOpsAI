import React from "react";
import { SupportOpsDemo } from "./support-ops-demo";

export const SupportOps = () => {
  return (
    <section id="demo" className="min-h-svh relative flex flex-col pb-16">
      <div className="border-t  border-white/20 min-h-[15svh]">
        <div className="container mx-auto px-4 xl:px-0 flex flex-col items-center justify-center gap-4 text-center min-h-[15svh] py-12">
          <p className="text-my-blue">{"//"} INSIDE SUPPRTOPS</p>
          <h2 className="min-w-0  max-w-2xl text-[clamp(1.75rem,3.5vw,3.5rem)] font-medium leading-tight tracking-tight text-center">
            Every answer leaves <br /> a{" "}
            <span className="text-my-blue">trail</span>.
          </h2>
        </div>
      </div>

      {/*bottom*/}
      <div className="container mx-auto flex flex-1 flex-col px-4 xl:px-0">
        <SupportOpsDemo />
      </div>
    </section>
  );
};
