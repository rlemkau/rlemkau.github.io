// VEX relay: a tiny free Cloudflare Worker that lets VEX (in your browser) talk to services
// that block direct browser calls, like Perplexity and Fish Audio.
//
// Setup (about 5 minutes, free):
//   1. Go to dash.cloudflare.com and sign up / log in.
//   2. Workers & Pages → Create → Create Worker → name it "vex-relay" → Deploy.
//   3. Click "Edit code", delete everything, paste this whole file, and click Deploy.
//   4. Copy the worker's address (like https://vex-relay.yourname.workers.dev)
//      and paste it into VEX → Settings → "Relay URL".
//
// Your API keys are NOT stored here. VEX sends them with each request and this
// relay just passes them along. Only the sites listed below may use it.

const ALLOWED_ORIGINS = [
  "https://rlemkau.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

const ROUTES = {
  "/perplexity/": "https://api.perplexity.ai/",
  "/fish/": "https://api.fish.audio/",
};

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const allowed = ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o + ":"));
    const cors = {
      "Access-Control-Allow-Origin": allowed ? origin : "null",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, content-type, model",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!allowed) return new Response("Origin not allowed", { status: 403, headers: cors });

    const url = new URL(req.url);
    if (url.pathname === "/" ) return new Response("VEX relay is running.", { headers: cors });
    const prefix = Object.keys(ROUTES).find((p) => url.pathname.startsWith(p));
    if (!prefix) return new Response("Not found", { status: 404, headers: cors });
    const target = ROUTES[prefix] + url.pathname.slice(prefix.length) + url.search;

    const headers = {};
    for (const h of ["authorization", "content-type", "model"]) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    const upstream = await fetch(target, { method: req.method, headers, body: req.method === "GET" ? undefined : req.body });
    const out = new Headers(cors);
    out.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
