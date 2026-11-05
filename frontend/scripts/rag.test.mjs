import { describe, expect, test } from "bun:test";
import { jsonResponse, readEvents } from "../src/lib/rag-client.ts";

describe("RAG transport", () => {
  test("reads fragmented SSE and UTF-8, ignoring heartbeats", async () => {
    const text = ': heartbeat\n\nevent: text_delta\ndata: {"delta":"Policy 📄"}\n\nevent: done\ndata: {"text":"Done","citations":[]}\n\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    const events = [];
    for await (const event of readEvents(stream)) events.push(event);
    expect(events).toEqual([
      { type: "text_delta", data: { delta: "Policy 📄" } },
      { type: "done", data: { text: "Done", citations: [] } },
    ]);
  });

  test("stopping consumption cancels the stream", async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('event: done\ndata: {"text":"Done"}\n\n')); },
      cancel() { cancelled = true; },
    });
    for await (const event of readEvents(stream)) {
      expect(event.type).toBe("done");
      break;
    }
    expect(cancelled).toBe(true);
  });

  test("surfaces backend service errors", async () => {
    await expect(jsonResponse(Response.json({ detail: "Only failed documents can be retried." }, { status: 409 }))).rejects.toThrow("Only failed documents can be retried.");
    expect(await jsonResponse(Response.json({ documents: [] }))).toEqual({ documents: [] });
  });
});
