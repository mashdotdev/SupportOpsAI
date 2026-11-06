export type KnowledgeDocument = {
  id: string;
  filename: string;
  media_type: string;
  byte_size: number;
  status: "awaiting_upload" | "queued" | "indexing" | "ready" | "failed" | "deleting";
  chunk_count: number;
  error: string | null;
  created_at: string;
};

export type Citation = {
  id: string;
  document_id: string;
  chunk_id: string;
  filename: string;
  location: string;
  page: number | null;
  excerpt: string;
  url: string;
};

export async function jsonResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    const detail = body.error || body.detail;
    const message = Array.isArray(detail) ? detail.map((item) => `${item.loc?.filter((part: string) => part !== "body").join(".") || "Input"}: ${item.msg}`).join("; ") : detail;
    throw new Error(typeof message === "string" ? message : "The request failed. Please try again.");
  }
  return body as T;
}

export function uploadFile(file: File, upload: { url: string; fields: Record<string, string> }, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", upload.url);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Storage rejected the upload. Please try again."));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and storage CORS configuration."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
    form.append("file", file);
    xhr.send(form);
  });
}

export type StreamEvent = { type: string; data: Record<string, unknown> };

export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const type = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
        const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (type && data) yield { type, data: JSON.parse(data) };
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
