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
        <div
          data-change-card-theme
          className="mx-auto mt-12 sm:mt-16 [--card-surface:#ffffff] [--card-secondary:#f7f7f5] [--card-inset:#eeeeeb] [--card-raised:#e5e5e2] [--card-metric:#f7f7f5] [--card-ink:#171717] [--card-border:rgba(0,0,0,0.12)] text-[var(--card-ink)]"
        >
          <div className="grid gap-2 border border-[var(--card-border)] p-2 md:grid-cols-2 rounded-lg">
            {STEPS.slice(0, 2).map((step, index) => (
              <article
                key={step.title}
                className={`min-w-0 overflow-hidden p-5 text-[var(--card-ink)] rounded-xl sm:p-8 ${index === 0 ? "bg-[var(--card-surface)]" : "bg-[var(--card-secondary)]"}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="rounded-full border border-[var(--card-border)] px-2 py-0.5">
                    {step.label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 border border-[var(--card-border)] px-2 py-0.5">
                    <span className="size-1.5 rounded-full bg-my-blue" />
                    {index === 0 ? "Grounded" : "Validated"}
                  </span>
                </div>
                <h3 className="mt-5 font-satoshi text-xl font-semibold tracking-tight sm:text-2xl lg:text-3xl">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-sm font-satoshi text-lg leading-relaxed opacity-60">
                  {step.description}
                </p>
                <div className="relative mt-10 h-64 overflow-hidden rounded-2xl border-8 border-[var(--card-border)] bg-[var(--card-inset)] p-5 sm:mt-12 sm:p-7">
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
                        <span className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--card-border)] px-2 py-1 font-satoshi text-sm">
                          <span aria-hidden="true" className="text-my-blue">
                            {index === 0 ? "≡" : "✓"}
                          </span>
                          <span className="truncate">{label}</span>
                        </span>
                        <span className="shrink-0 text-xs uppercase tracking-tight opacity-50">
                          {index === 0 ? "Source" : "Pass"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--card-inset)] to-transparent"
                  />
                </div>
              </article>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="mx-auto h-12 w-px bg-[var(--card-border)] sm:h-16"
          />
          <article className="overflow-hidden bg-[var(--card-surface)] rounded-xl p-4 text-[var(--card-ink)] sm:p-8 lg:p-12">
            <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-inset)] p-5 sm:p-8 lg:p-10">
              <p className="text-sm  uppercase tracking-tighter opacity-50">
                SupportOps / Evaluation trace
              </p>
              <div className="mt-8 flex justify-end sm:mt-12">
                <p className="max-w-sm rounded-xl bg-[var(--card-raised)] px-4 py-3 font-satoshi text-sm">
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
                  <p className="mt-2 max-w-xl font-satoshi text-sm sm:text-base leading-relaxed opacity-70">
                    {STEPS[2].description}
                  </p>
                  <p className="mt-5 text-sm tracking-tight uppercase opacity-50">
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
                        className="rounded-lg border border-[var(--card-border)] bg-[var(--card-metric)] p-3 sm:p-4"
                      >
                        <p className="font-satoshi text-sm opacity-70">
                          {label}
                        </p>
                        <p className="mt-2 font-semibold text-my-blue">
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
