import { ragProxy } from "@/lib/rag-proxy";

export const maxDuration = 120;

export async function POST(request: Request) {
  return ragProxy(request, "playground/chat");
}
