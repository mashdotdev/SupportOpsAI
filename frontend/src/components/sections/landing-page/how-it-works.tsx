const STEPS = [
  {
    title: "Retrieve",
    description:
      "Search the knowledge base and surface relevant source passages.",
    label: "KB",
    value: "06",
  },
  {
    title: "Verify and act",
    description:
      "Generate an evidence-backed response or request a validated tool action.",
    label: "API",
    value: "✓",
  },
  {
    title: "Evaluate",
    description: "Measure correctness, citation support, latency, and cost.",
    label: "EVAL",
    value: "94",
  },
];

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

        {/*bottom*/}
        <div className="mx-auto mt-12 sm:mt-16">
          <div className="grid gap-2 border border-my-white/20 p-2 md:grid-cols-2 rounded-md">
            {STEPS.slice(0, 2).map((step, index) => (
              <article
                key={step.title}
                className={`min-w-0 overflow-hidden p-5 text-my-white rounded-lg sm:p-8 ${index === 0 ? "bg-[#141414]" : "bg-[#181818]"}`}
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                  <span className="rounded-full border border-my-white/30 px-2 py-0.5">
                    {step.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 border border-my-white/20 px-2 py-0.5">
                    <span className="size-1.5 rounded-full bg-my-blue" />
                    {index === 0 ? "Grounded" : "Validated"}
                  </span>
                </div>
                <h3 className="mt-5 font-satoshi text-xl font-semibold tracking-tight sm:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-sm font-satoshi text-sm leading-relaxed opacity-70">
                  {step.description}
                </p>
                <div className="relative mt-10 h-64 overflow-hidden rounded-[2rem] border-8 border-white/5 bg-[#0a0a0a] p-5 sm:mt-12 sm:p-7">
                  <div className="mb-6 flex items-center gap-3 font-satoshi text-sm">
                    {index === 0 ? "Relevant sources" : "Action checks"}
                    <span className="rounded-lg bg-my-blue/10 px-2 py-1 text-lg font-semibold text-my-blue">
                      {step.value}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {(index === 0
                      ? [
                          "return-policy.md",
                          "customer-tiers.yaml",
                          "escalation-playbook.md",
                          "support-guidelines.md",
                        ]
                      : [
                          "Evidence attached",
                          "Parameters validated",
                          "Permissions checked",
                          "Action recorded",
                        ]
                    ).map((label, row) => (
                      <div
                        key={label}
                        className="flex min-w-0 items-center justify-between gap-3"
                        style={{ opacity: 1 - row * 0.2 }}
                      >
                        <span className="flex min-w-0 items-center gap-2 rounded-lg border border-my-white/20 px-2 py-1 font-satoshi text-xs">
                          <span aria-hidden="true" className="text-my-blue">
                            {index === 0 ? "≡" : "✓"}
                          </span>
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-my-white/50">
                          {index === 0 ? "Source" : "Pass"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent"
                  />
                </div>
              </article>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="mx-auto h-12 w-px bg-my-white/20 sm:h-16 rounded-lg"
          />
          <article className="overflow-hidden bg-[#141414] rounded-lg p-4 text-my-white sm:p-8 lg:p-12">
            <div className="rounded-2xl border border-my-white/10 bg-[#0a0a0a] p-5 sm:p-8 lg:p-10">
              <p className="font-mono text-[10px] uppercase tracking-wider text-my-white/50">
                SupportOps / Evaluation trace
              </p>
              <div className="mt-8 flex justify-end sm:mt-12">
                <p className="max-w-sm rounded-xl bg-[#202020] px-4 py-3 font-satoshi text-sm">
                  Can this answer be verified?
                </p>
              </div>
              <div className="mt-8 flex items-start gap-3 sm:gap-5">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-my-blue font-mono text-xs font-semibold text-white"
                >
                  AI
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-satoshi text-xl font-semibold sm:text-2xl">
                    {STEPS[2].title}
                  </h3>
                  <p className="mt-2 max-w-xl font-satoshi text-sm leading-relaxed text-my-white/70">
                    {STEPS[2].description}
                  </p>
                  <p className="mt-5 font-mono text-[10px] uppercase tracking-wider text-my-white/40">
                    Example evaluation
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {[
                      ["Correctness", "94 / 100"],
                      ["Citation support", "Verified"],
                      ["Latency", "1.4 s"],
                      ["Cost", "$0.002"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-lg border border-my-white/10 bg-[#161616] p-3 sm:p-4"
                      >
                        <p className="font-satoshi text-[11px] text-my-white/60">
                          {label}
                        </p>
                        <p className="mt-2 font-mono text-sm font-semibold text-my-blue">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
