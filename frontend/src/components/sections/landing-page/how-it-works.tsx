import React from "react";

export const HowItWorks = () => {
  return (
    <section className="overflow-hidden relative">
      <div className="py-16 min-h-[50svh] container mx-auto px-4 xl:px-0">
        <p className="text-my-blue">{"//"} HOW IT WORKS</p>
        <p
          data-change-color
          className="max-w-2xl sm:text-base lg:text-xl 2xl:text-2xl mt-4 font-satoshi font-semibold"
        >
          From customer question to verifiable answer. A controlled support loop
          that makes every source, action, and outcome inspectable
        </p>
      </div>
    </section>
  );
};
