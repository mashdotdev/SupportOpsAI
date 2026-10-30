"use client";

import { useId, useRef, useState } from "react";

const TABS = [
  {
    title: "Evidence retrieval",
    description: "Ground every response in inspectable sources.",
  },
  {
    title: "Controlled actions",
    description: "Separate model intent from server execution.",
  },
  {
    title: "Evaluation",
    description: "Test quality before and after every change.",
  },
];

const SOURCES = [
  {
    title: "Billing permissions",
    before: "Workspace admins can transfer ",
    highlight: "billing ownership",
    after:
      " from Settings → Billing. Select an active workspace member as the new owner.",
    relevance: "0.96",
  },
  {
    title: "Manage workspace roles",
    before: "The new owner must be an active member and ",
    highlight: "confirm the transfer",
    after: " from the email sent to their account.",
    relevance: "0.91",
  },
  {
    title: "Invoices and payment",
    before:
      "Billing owners can access invoices, change payment methods, and update the billing contact.",
    highlight: "",
    after: "",
    relevance: "0.72",
  },
];

const CASES = [
  {
    id: "E-104",
    test: "Billing owner transfer",
    outcome: "Passed",
    note: "Citations supported",
  },
  {
    id: "E-105",
    test: "Refund outside policy",
    outcome: "Failed",
    note: "Policy conflict",
  },
  {
    id: "E-106",
    test: "Enterprise data export",
    outcome: "Review",
    note: "Escalation expected",
  },
  {
    id: "E-107",
    test: "Update payment method",
    outcome: "Passed",
    note: "Action validated",
  },
];

const labelClass = "font-mono text-[10px] uppercase tracking-wider";

function EvidencePanel() {
  return (
    <div className="grid lg:min-h-[420px] lg:grid-cols-[1fr_2fr]">
      <div className="relative flex min-h-80 flex-col border-b border-my-white/15 p-6 sm:p-10 lg:border-r lg:border-b-0">
        <p
          className={`${labelClass} absolute top-6 left-6 text-my-blue sm:top-10 sm:left-10`}
        >
          Query / 84F2
        </p>
        <div className="flex flex-1 flex-col items-start justify-center py-12 text-start">
          <h3 className="max-w-sm text-2xl font-medium leading-tight tracking-tight sm:text-3xl">
            How can an admin transfer billing ownership?
          </h3>
          <p className="mt-7 flex flex-wrap justify-start gap-5 font-mono text-[10px] text-my-white/60">
            <span>6 passages retrieved</span>
            <span>42ms</span>
          </p>
        </div>
      </div>
      <div className="px-6 py-3 sm:px-8">
        {SOURCES.map((source, index) => (
          <article
            key={source.title}
            className="grid grid-cols-[20px_1fr] gap-3 border-b border-my-white/15 py-6 last:border-b-0 sm:gap-5"
          >
            <span className={`${labelClass} pt-1 text-my-white/50`}>
              0{index + 1}
            </span>
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold">{source.title}</h4>
                <span className="font-mono text-[9px] uppercase text-my-white/60">
                  Relevance {source.relevance}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-my-white/75">
                {source.before}
                {source.highlight && (
                  <mark className="bg-my-blue/15 text-my-white">
                    {source.highlight}
                  </mark>
                )}
                {source.after}
              </p>
              <p className="mt-3 font-mono text-[9px] text-my-white/50">
                help-center / administration
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ActionsPanel() {
  return (
    <div className="grid items-center gap-6 p-6 sm:p-10 lg:min-h-[420px] lg:grid-cols-[1fr_90px_1fr] lg:gap-5">
      <div className="min-w-0 border border-my-black/15">
        <h3
          className={`${labelClass} border-b border-my-white/15 px-5 py-4 text-my-blue`}
        >
          Model proposal
        </h3>
        <pre className="overflow-x-auto p-5 font-mono text-xs leading-7 sm:p-7">
          <code>
            {"tool: "}
            <span className="text-my-blue">{'"lookup_subscription"'}</span>
            {",\narguments: {\n  workspace_id: "}
            <span className="text-my-blue">{'"ws_84F2"'}</span>
            {"\n}"}
          </code>
        </pre>
        <p className="border-t border-my-white/15 px-5 py-3 font-mono text-[10px] text-my-white/60">
          ○ Proposed, not executed
        </p>
      </div>
      <div
        className="flex flex-col items-center gap-2 text-center"
        aria-hidden="true"
      >
        <span className="font-mono text-[8px] uppercase text-my-white/50">
          Server boundary
        </span>
        <span className="text-2xl text-my-blue lg:hidden">↓</span>
        <span className="hidden w-full text-2xl text-my-blue lg:block">⟶</span>
      </div>
      <div className="min-w-0 border border-my-white/15">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-my-white/15 px-5 py-4 text-my-blue">
          <h3 className={labelClass}>Server execution</h3>
          <span className="font-mono text-[9px] uppercase">Validated</span>
        </div>
        {["Schema validation", "Permission check"].map((check) => (
          <div
            key={check}
            className="flex justify-between gap-3 border-b border-my-white/10 px-5 py-4 text-xs"
          >
            <span className="text-my-white/70">{check}</span>
            <span className="font-mono text-[10px] text-my-blue">Passed</span>
          </div>
        ))}
        <div className="m-4 bg-my-blue/5 p-4">
          <p className={`${labelClass} mb-4 text-my-white/50`}>
            Safe mock result
          </p>
          <dl className="space-y-3 font-mono text-[11px]">
            {[
              ["plan", "Team annual"],
              ["status", "Active"],
              ["billing_owner", "a···@example.com"],
            ].map(([key, value]) => (
              <div key={key} className="flex flex-wrap justify-between gap-2">
                <dt className="text-my-white/60">{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function EvaluationPanel() {
  return (
    <div className="grid lg:min-h-[420px] lg:grid-cols-[220px_1fr]">
      <aside className="border-b border-my-black/15 p-6 lg:border-r lg:border-b-0">
        <span
          className={`${labelClass} inline-block bg-my-blue/15 px-2 py-1 text-my-blue`}
        >
          Demo data
        </span>
        <dl className="mt-5 grid grid-cols-3 gap-4 lg:grid-cols-1">
          {[
            ["Citation support", "94"],
            ["Tool accuracy", "91"],
            ["Needs review", "08"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="border-b border-my-black/15 pb-5 lg:pt-2"
            >
              <dt className="font-mono text-[9px] uppercase text-my-white/60">
                {label}
              </dt>
              <dd className="mt-3 text-3xl font-medium">
                {value}
                <span className="font-mono text-xs text-my-white/60">%</span>
              </dd>
            </div>
          ))}
        </dl>
      </aside>
      <div className="min-w-0 p-5 sm:p-7">
        <div
          className="overflow-x-auto"
          role="region"
          aria-label="Evaluation results"
          tabIndex={0}
        >
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="border-b border-my-black/15 font-mono text-[9px] uppercase text-my-white/60">
              <tr>
                {["Case", "Test", "Outcome", "Note"].map((heading) => (
                  <th key={heading} className="px-3 py-4 font-normal">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CASES.map((row) => (
                <tr key={row.id} className="border-b border-my-black/15">
                  <td className="px-3 py-6 font-mono text-[10px] text-my-white/60">
                    {row.id}
                  </td>
                  <th scope="row" className="px-3 py-6 font-medium">
                    {row.test}
                  </th>
                  <td className="px-3 py-6">
                    <span
                      className={`px-2 py-1 font-mono text-[9px] uppercase ${row.outcome === "Passed" ? "bg-my-blue/10 text-my-blue" : row.outcome === "Failed" ? "bg-red-500/10 text-red-700" : "bg-amber-500/10 text-amber-800"}`}
                    >
                      {row.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-6 font-mono text-[10px] text-my-white/60">
                    {row.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 font-mono text-[9px] uppercase text-my-white/50">
          Seeded evaluation set · 4 of 24 cases shown
        </p>
      </div>
    </div>
  );
}

export const SupportOpsDemo = () => {
  const [activeTab, setActiveTab] = useState(0);
  const id = useId();
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div className="flex flex-1 flex-col border border-my-white/20 border-dashed font-satoshi text-my-white">
      <div
        role="tablist"
        aria-label="Inside SupportOps"
        className="grid grid-cols-3 border-b border-my-white/15"
      >
        {TABS.map((tab, index) => (
          <button
            key={tab.title}
            ref={(element) => {
              tabsRef.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={activeTab === index}
            tabIndex={activeTab === index ? 0 : -1}
            onClick={() => setActiveTab(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
              else if (event.key === "ArrowLeft")
                next = (index + TABS.length - 1) % TABS.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = TABS.length - 1;
              else return;
              event.preventDefault();
              setActiveTab(next);
              tabsRef.current[next]?.focus();
            }}
            className={`min-w-0 cursor-pointer border-r border-b-2 p-3 text-left transition-colors last:border-r-0 hover:bg-my-blue/5 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-my-blue sm:p-6 ${activeTab === index ? "border-b-my-blue border-r-my-black/15 bg-my-blue/5" : "border-b-transparent border-r-my-black/15"}`}
          >
            <span
              className={`mb-2 block font-mono text-[10px] ${activeTab === index ? "text-my-blue" : "text-my-black/50"}`}
            >
              0{index + 1}
            </span>
            <span className="block text-xs font-semibold sm:text-base">
              {tab.title}
            </span>
            <span className="mt-2 hidden text-xs leading-relaxed text-my-white/60 sm:block">
              {tab.description}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-my-white/15 px-4 py-4 font-mono text-[9px] uppercase tracking-wider text-my-white/60">
        <span className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-my-blue" />
          SupportOps / workspace_84F2
        </span>
        <span>Demo environment</span>
      </div>
      {TABS.map((tab, index) => (
        <div
          key={tab.title}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={activeTab !== index}
          tabIndex={0}
          className={`${activeTab === index ? "flex" : "hidden"} flex-1 flex-col [&>div]:flex-1 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-my-blue`}
        >
          {index === 0 ? (
            <EvidencePanel />
          ) : index === 1 ? (
            <ActionsPanel />
          ) : (
            <EvaluationPanel />
          )}
        </div>
      ))}
    </div>
  );
};
