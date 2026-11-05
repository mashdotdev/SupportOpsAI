import { ragProxy } from "@/lib/rag-proxy";

export const maxDuration = 120;

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const route = path.join("/");
  if (!/^documents(?:\/[0-9a-f-]{36}(?:\/(?:complete|retry|content))?)?$/i.test(route)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return ragProxy(request, `knowledge-base/${route}`);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
