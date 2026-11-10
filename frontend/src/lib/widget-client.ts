export type WidgetDraft = {
  agent_id: string | null;
  business_name: string;
  welcome_message: string;
  color: string;
  position: "left" | "right";
  suggested_questions: string[];
  allowed_origins: string[];
  document_ids: string[];
  privacy_url: string;
  support_email: string;
  daily_message_limit: number;
};
export const widgetDefaults: WidgetDraft = {
  agent_id: null,
  business_name: "Support",
  welcome_message: "Hi! How can we help you today?",
  color: "#0593c6",
  position: "right",
  suggested_questions: [],
  allowed_origins: [],
  document_ids: [],
  privacy_url: "",
  support_email: "",
  daily_message_limit: 30,
};
export type WidgetSettings = {
  widget: {
    id: string;
    draft: Partial<WidgetDraft>;
    version: number;
    enabled: boolean;
    published_revision_id: string | null;
    last_seen_at: string | null;
  };
  published: {
    number: number;
    configuration: WidgetDraft;
    created_at: string;
  } | null;
  today_messages: number;
};
export type PublicWidget = Pick<
  WidgetDraft,
  | "business_name"
  | "welcome_message"
  | "color"
  | "position"
  | "suggested_questions"
  | "privacy_url"
  | "support_email"
  | "allowed_origins"
> & { enabled: boolean };
export type VisitorConversation = {
  conversation_id: string;
  status: string;
  turns: {
    id: string;
    question: string;
    answer: string | null;
    status: string;
    response_type: string | null;
  }[];
  notification_status: string | null;
  visitor_name: string;
  visitor_email: string;
  feedback: string | null;
};

// Delivered only after the server validates access and commits the answer.
export function completeWidgetTurn(
  current: VisitorConversation | null,
  result: Record<string, unknown>,
  question: string,
): VisitorConversation {
  if (
    typeof result.id !== "string" ||
    typeof result.text !== "string" ||
    typeof result.conversation_id !== "string" ||
    typeof result.conversation_status !== "string" ||
    typeof result.response_type !== "string"
  ) throw new Error("The completed response was invalid. Please retry.");
  const state = current?.conversation_id === result.conversation_id ? current : null;
  const turn = {
    id: result.id,
    question,
    answer: result.text,
    status: "completed",
    response_type: result.response_type,
  };
  const turns = state?.turns || [];
  return {
    conversation_id: result.conversation_id,
    status: result.conversation_status,
    turns: turns.some((item) => item.id === turn.id)
      ? turns.map((item) => item.id === turn.id ? turn : item)
      : [...turns, turn].slice(-100),
    notification_status: state?.notification_status || null,
    visitor_name: state?.visitor_name || "",
    visitor_email: state?.visitor_email || "",
    feedback: state?.feedback || null,
  };
}

export function notificationMessage(status: string | null) {
  if (status === "sent")
    return "The support team has been notified. Leave your contact details for follow-up.";
  if (status === "queued" || status === "sending")
    return "Your support notification is being sent.";
  if (status === "unknown")
    return "We could not confirm notification delivery. Please use the support contact below.";
  if (status === "failed" || status === "cancelled")
    return "We could not notify the team. Please use the support contact below.";
  return "This conversation needs human attention. Please use the support contact below.";
}
