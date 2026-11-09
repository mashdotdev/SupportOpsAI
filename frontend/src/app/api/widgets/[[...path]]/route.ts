import { ragProxy } from "@/lib/rag-proxy";

async function proxy(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const path = (await context.params).path?.join("/") || "";
  if (
    !(path === "" && ["GET", "PUT"].includes(request.method)) &&
    !(["publish", "pause"].includes(path) && request.method === "POST")
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return ragProxy(request, `widgets${path ? "/" + path : ""}`);
}
export { proxy as GET, proxy as PUT, proxy as POST };
