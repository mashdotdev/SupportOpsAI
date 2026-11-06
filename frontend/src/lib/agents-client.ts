export type Authority = {
  scope: string;
  communication_style: string;
  boundaries: string;
  escalation_rules: string;
  escalation_message: string;
};

export type AgentConfiguration = {
  name: string;
  model_id: string;
  instructions: string;
  authority: Authority;
  knowledge_mode: "all" | "selected";
  document_ids: string[];
};

export type SavedAgent = AgentConfiguration & {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
};

export type AgentModel = { id: string; name: string; provider: string; context_length: number | null };

export const initialConfiguration: AgentConfiguration = {
  name: "",
  model_id: "openrouter/free",
  instructions: "You are a helpful customer support assistant. Understand the customer's question, search the knowledge base for relevant information, and explain the answer clearly.",
  authority: {
    scope: "Help customers understand the policies and information in the knowledge base.",
    communication_style: "Be friendly, professional, and concise. Use plain language and ask for clarification when needed.",
    boundaries: "Never approve refunds, promise exceptions, invent policy details, or claim to have performed actions.",
    escalation_rules: "Recommend human assistance for policy exceptions, disputed charges, requests outside your role, conflicting policies, or insufficient information.",
    escalation_message: "I need a member of the support team to help with this. Please contact support for further assistance.",
  },
  knowledge_mode: "all",
  document_ids: [],
};

export function configurationOf(agent: AgentConfiguration): AgentConfiguration {
  return { name: agent.name, model_id: agent.model_id, instructions: agent.instructions,
    authority: { ...agent.authority }, knowledge_mode: agent.knowledge_mode, document_ids: [...agent.document_ids] };
}
