"use client";

import { cn } from "cn";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const Playground = () => {
  const [message, setMessage] = useState("");
  const conversationRef = useRef<HTMLDivElement>(null);
  const [messageHistory, setMessageHistory] = useState<
    {
      role: "user" | "ai";
      message: string;
    }[]
  >([
    {
      role: "user",
      message: "Hello",
    },
    { role: "ai", message: "Hello, how may I help you" },
    {
      role: "user",
      message:
        "I want to check if my project knowledge base is working fine, show me the citations, sources",
    },
    { role: "ai", message: "Ok, sure let me check" },
  ]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messageHistory]);

  const onSend = () => {
    const text = message.trim();
    if (!text) return;
    setMessageHistory((history) => [
      ...history,
      { role: "user", message: text },
    ]);
    setMessage("");
  };

  return (
    <section
      aria-labelledby="playground-title"
      className="mx-auto flex h-[calc(100dvh-3.5rem)] min-h-0 w-full max-w-5xl flex-col overflow-hidden px-4 sm:px-6 lg:px-8"
    >
      <div className="shrink-0 pb-4 pt-2 sm:pb-6 sm:pt-4">
        <h1
          id="playground-title"
          className="text-center text-2xl lg:text-3xl font-medium"
        >
          Playground Chat
        </h1>
        <p className="max-w-xl text-center mx-auto mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Test how your agent would perform in the real world. This chat
          won&apos;t be saved anywhere, this is a temporary chat just for
          testing
        </p>
      </div>

      {/* chats */}
      <div
        ref={conversationRef}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain py-4 pr-2 sm:gap-8 sm:py-6"
      >
        {messageHistory.map(({ role, message }, index) => (
          <div
            key={index}
            className={cn(
              "min-w-0 max-w-full sm:max-w-[90%]",
              role === "user" ? "self-end" : "self-start",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 items-end gap-2 sm:gap-4",
                role === "user" ? "flex-row-reverse" : "flex-row",
              )}
            >
              <div className="bg-my-blue text-my-white size-8 shrink-0 rounded-xs flex items-center justify-center text-xs sm:size-10 sm:text-sm">
                {role === "ai" ? "AI" : "You"}
              </div>
              <p
                className={cn(
                  "min-w-0 max-w-2xl whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed sm:text-base",
                  role === "user" ? "text-end" : "text-start",
                )}
              >
                {message}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* message box */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="shrink-0 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pt-4"
      >
        <FieldGroup>
          <Field orientation="horizontal">
            <label htmlFor="chat-message" className="sr-only">
              Message
            </label>
            <Input
              id="chat-message"
              type="text"
              placeholder="Type a message"
              autoComplete="off"
              className="h-14 flex-1 sm:h-16"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button
              type="submit"
              size="icon-lg"
              aria-label="Send message"
              isDisabled={!message.trim()}
            >
              <Send />
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </section>
  );
};

export default Playground;
