/* SupportOps website loader. The public widget ID is configuration, not a credential. */
(() => {
  "use strict";
  const script = document.currentScript;
  const id = script && script.getAttribute("data-widget-id");
  if (!id || !/^[\da-f-]{36}$/i.test(id) || document.getElementById("supportops-widget-" + id)) return;
  const appOrigin = new URL(script.src).origin;
  const container = document.createElement("div");
  container.id = "supportops-widget-" + id;
  // Shadow DOM isolates the launcher from the host's style rules.
  const shadow = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = ":host{all:initial;position:fixed;bottom:20px;right:20px;z-index:2147483000;font:14px system-ui;display:flex;flex-direction:column;align-items:flex-end}button{all:initial;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:#0593c6;color:#fff;box-shadow:0 4px 20px #0003;font:24px system-ui}button:focus-visible{outline:3px solid #111;outline-offset:3px}iframe{display:none;border:0;border-radius:18px;width:min(390px,calc(100vw - 32px));height:min(620px,calc(100dvh - 100px));box-shadow:0 8px 45px #0003;margin-bottom:12px;background:#fff}@media(max-width:480px){:host{bottom:12px;right:12px}iframe{width:calc(100vw - 24px);height:calc(100dvh - 96px)}}";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "✦";
  button.setAttribute("aria-label", "Open support chat");
  button.setAttribute("aria-expanded", "false");
  const frame = document.createElement("iframe");
  frame.title = "Customer support chat";
  frame.src = appOrigin + "/embed/" + id;
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms");
  const storageKey = "supportops-widget:" + id + ":" + appOrigin;
  let frameReady = false;
  // Before navigation completes, about:blank inherits the embedding site's origin.
  // Only message the frame after it has identified itself from the app origin.
  function post(data) { if (frameReady && frame.contentWindow) frame.contentWindow.postMessage(data, appOrigin); }
  function close() {
    frame.style.display = "none";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open support chat");
    post({ type: "supportops:hidden", widgetId: id });
    button.focus();
  }
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-expanded") === "true") { close(); return; }
    frame.style.display = "block";
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Close support chat");
    post({ type: "supportops:focus", widgetId: id });
    frame.focus();
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== appOrigin || event.source !== frame.contentWindow || !event.data || event.data.widgetId !== id) return;
    const data = event.data;
    if (data.type === "supportops:ready") {
      frameReady = true;
      let token = "";
      try { token = localStorage.getItem(storageKey) || ""; } catch { /* Session-only mode. */ }
      post({ type: "supportops:init", widgetId: id, token: token.length <= 100 ? token : "", open: button.getAttribute("aria-expanded") === "true" });
    } else if (data.type === "supportops:session" && typeof data.token === "string" && data.token.length <= 100) {
      try { if (data.token) localStorage.setItem(storageKey, data.token); else localStorage.removeItem(storageKey); } catch { /* Session-only mode. */ }
    } else if (data.type === "supportops:appearance") {
      if (/^#[\da-f]{6}$/i.test(data.color)) button.style.background = data.color;
      if (data.position === "left") { container.style.left = "20px"; container.style.right = "auto"; container.style.alignItems = "flex-start"; }
    } else if (data.type === "supportops:close") close();
  });
  shadow.append(style, frame, button);
  (document.body || document.documentElement).append(container);
})();
