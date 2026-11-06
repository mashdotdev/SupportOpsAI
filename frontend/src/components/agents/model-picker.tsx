"use client";

import { AgentModel } from "@/lib/agents-client";
import { Label } from "@/components/ui/label";
import { Select, SelectGroup, SelectInput, SelectItem, SelectList, SelectPopover, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export function ModelPicker({ models, value, onChange, disabled }: {
  models: AgentModel[]; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const available = models.some((model) => model.id === value);
  const options = available ? models : [{ id: value, name: `${value} (unavailable)`, provider: "", context_length: null }, ...models];
  const filtered = options.filter((model) => `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(search.toLowerCase()));
  return <Select value={value} onChange={(key) => { if (key) onChange(String(key)); }} isDisabled={disabled} className="w-full" onOpenChange={() => setSearch("")}>
    <Label>Model</Label>
    <SelectTrigger><SelectValue>{({ selectedText }) => selectedText}</SelectValue></SelectTrigger>
    <SelectPopover>
      <SelectInput aria-label="Search models" value={search} onChange={setSearch} />
      <SelectList aria-label="Free OpenRouter models" className="max-h-72" disabledKeys={available ? [] : [value]} renderEmptyState={() => "No matching models"}>
        <SelectGroup>{filtered.map((model) => <SelectItem key={model.id} id={model.id} textValue={model.name}>
          <span className="flex min-w-0 flex-col"><span className="truncate">{model.name}</span><span className="text-xs text-muted-foreground">{model.provider} · Free{model.context_length ? ` · ${Math.round(model.context_length / 1000)}k context` : ""}</span></span>
        </SelectItem>)}</SelectGroup>
      </SelectList>
    </SelectPopover>
  </Select>;
}
