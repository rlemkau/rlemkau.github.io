// Cloudflare Worker that relays VEX's voice requests to Fish Audio.
// Only needed if Fish Audio blocks direct calls from the browser (CORS).
// Deploy free at dash.cloudflare.com → Workers → Create → paste this → Deploy.
// Then paste the worker URL into VEX → Settings → Voice → Voice server URL.

const ALLOWED_ORIGINS = [
  // Add your site here, e.g. "https://rlemkau.github.io"
];

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin || "*" : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, model",
      "Access-Control-Max-Age": "86400",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (!allowed) return new Response("Origin not allowed", { status: 403, headers: cors });

    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/v1/tts") return new Response("Not found", { status: 404, headers: cors });

    const upstream = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        "Authorization": req.headers.get("Authorization") || "",
        "Content-Type": req.headers.get("Content-Type") || "application/json",
        "model": req.headers.get("model") || "s2.1-pro",
      },
      body: req.body,
    });
    const headers = new Headers(cors);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "audio/mpeg");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
