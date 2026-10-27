// VEX: a smug, theatrical AI that challenges how you think.
// Two brains: a local model that runs in the browser (offline) and Claude (online, with web search).
// Everything VEX learns is saved in this browser and shared by both brains.

const $ = (s) => document.querySelector(s);

// ---------- Storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("vex." + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("vex." + k, JSON.stringify(v)); } catch (e) { console.warn("save failed", e); } },
};

const LOCAL_MODELS = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Quick (Qwen 2.5 1.5B, ~1 GB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Smarter (Llama 3.2 3B, ~2 GB)" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Thoughtful (Phi 3.5 mini, ~2.2 GB)" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Tiny (Llama 3.2 1B, ~0.9 GB, weak devices)" },
];

const settings = Object.assign({
  name: "Shawn",
  mode: "auto",
  apiKey: "",
  cloudModel: "claude-opus-5-5",
  unfiltered: false,
  deepThink: "auto",
  callModel: "claude-haiku-5-5",
  thinkMode: "challenge",
  localModel: LOCAL_MODELS[0].id,
  webSearch: true,
  intensity: "sharp",
  showRead: true,
  showBS: true,
  voiceOn: true,
  fishKey: "",
  fishVoice: "6e93773188d94a5caa149b5dec67bcf2",
  fishModel: "s2.1-pro",
  fishProxy: "",
  pcVoiceUrl: "",
  pcVoiceId: "vex",
  githubToken: "",
}, store.get("settings", {}));
let sinceReflect = store.get("sinceReflect", 0);

let chat = store.get("chat", []);          // [{role, text, via, sources, learned}]
let memory = store.get("memory", []);      // [{id, kind: "me"|"world", text, source, at}]

// Only real changes count as "newer" for sync (API keys and tokens never sync, so they don't count).
const publicSettings = () => JSON.stringify(Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET.includes(k))));
let lastPublic = null;
const saveSettings = () => {
  store.set("settings", settings);
  const now = publicSettings();
  if (lastPublic !== null && now !== lastPublic) { sync.settingsAt = Date.now(); store.set("settingsAt", sync.settingsAt); markDirty(); }
  lastPublic = now;
};
const saveChat = () => { store.set("chat", chat.slice(-200)); markDirty(); };
const saveMemory = () => { store.set("memory", memory); markDirty(); };
// ---------- Sync across devices (private GitHub Gist) ----------
// Memories, chat and settings sync between your phone and computer. Changes made offline wait and
// sync automatically when you're back online. API keys never leave the device they were typed on.
const SECRET = ["apiKey", "fishKey", "githubToken"];
const SYNC_FILE = "vex-sync.json";
const sync = {
  gistId: store.get("gistId", ""),
  tomb: store.get("tomb", {}),            // deleted memory ids → when
  clearedAt: store.get("clearedAt", 0),   // chat cleared before this time
  settingsAt: store.get("settingsAt", 0),
  dirty: store.get("syncDirty", false),
  timer: null, running: false, last: store.get("lastSync", 0), error: "",
};
const msgKey = (m) => `${m.role}:${m.at}`;

function markDirty() {
  sync.dirty = true; store.set("syncDirty", true);
  clearTimeout(sync.timer);
  sync.timer = setTimeout(syncNow, 4000);
}

function snapshot() {
  const s = Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET.includes(k)));
  const lite = chat.slice(-150).map(({ thoughts, ...m }) => ({ ...m, files: m.files?.map(({ preview, ...f }) => f) }));
  return { app: "vex", v: 1, at: Date.now(), settings: s, settingsAt: sync.settingsAt, memory, tomb: sync.tomb, chat: lite, clearedAt: sync.clearedAt };
}

function mergeRemote(r) {
  let changed = false;
  if (r.settingsAt > sync.settingsAt && r.settings) {
    const keep = Object.fromEntries(SECRET.map((k) => [k, settings[k]]));
    Object.assign(settings, r.settings, keep);
    sync.settingsAt = r.settingsAt; store.set("settingsAt", sync.settingsAt);
    store.set("settings", settings);
    lastPublic = publicSettings();
    changed = true;
  }
  for (const [id, at] of Object.entries(r.tomb || {})) if (!sync.tomb[id] || sync.tomb[id] < at) sync.tomb[id] = at;
  store.set("tomb", sync.tomb);
  const mem = new Map(memory.map((m) => [m.id, m]));
  for (const m of r.memory || []) if (!mem.has(m.id)) { mem.set(m.id, m); changed = true; }
  const before = memory.length;
  memory = [...mem.values()].filter((m) => !sync.tomb[m.id]).sort((a, b) => a.at - b.at);
  if (memory.length !== before) changed = true;
  store.set("memory", memory);

  if ((r.clearedAt || 0) > sync.clearedAt) { sync.clearedAt = r.clearedAt; store.set("clearedAt", sync.clearedAt); changed = true; }
  const msgs = new Map(chat.map((m) => [msgKey(m), m]));
  for (const m of r.chat || []) if (!msgs.has(msgKey(m))) { msgs.set(msgKey(m), m); changed = true; }
  const n = chat.length;
  chat = [...msgs.values()].filter((m) => (m.at || 0) > sync.clearedAt).sort((a, b) => (a.at || 0) - (b.at || 0)).slice(-200);
  if (chat.length !== n) changed = true;
  store.set("chat", chat);
  return changed;
}

async function gh(path, opts = {}) {
  const res = await fetch("https://api.github.com" + path, {
    ...opts,
    headers: { "Authorization": "Bearer " + settings.githubToken, "Accept": "application/vnd.github+json", "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 401) throw new Error("GitHub rejected the sync token. Check it in Settings → Sync.");
  if (res.status === 404 && path.startsWith("/gists/")) return null;
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json();
}

async function findOrCreateGist() {
  if (sync.gistId) return sync.gistId;
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const hit = list?.find((g) => g.files?.[SYNC_FILE]);
    if (hit) { sync.gistId = hit.id; break; }
    if (!list || list.length < 100) break;
  }
  if (!sync.gistId) {
    const g = await gh("/gists", { method: "POST", body: JSON.stringify({ description: "VEX sync (private)", public: false, files: { [SYNC_FILE]: { content: JSON.stringify(snapshot()) } } }) });
    sync.gistId = g.id;
  }
  store.set("gistId", sync.gistId);
  return sync.gistId;
}

async function syncNow() {
  if (!settings.githubToken || !navigator.onLine || sync.running) return;
  sync.running = true;
  setSyncStatus("Syncing…");
  try {
    const id = await findOrCreateGist();
    let g = await gh(`/gists/${id}`);
    if (!g) { sync.gistId = ""; store.set("gistId", ""); g = await gh(`/gists/${await findOrCreateGist()}`); }
    const f = g.files?.[SYNC_FILE];
    let remote = null;
    if (f) {
      const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
      try { remote = JSON.parse(text); } catch {}
    }
    const changed = remote ? mergeRemote(remote) : false;
    if (changed && !busy) { render(); updateModeUI(); updateVoiceUI(); $("#modeSel").value = settings.thinkMode; $("#thinkSel").value = settings.deepThink; }
    const out = JSON.stringify(snapshot());
    if (sync.dirty || changed || !remote) {
      await gh(`/gists/${sync.gistId}`, { method: "PATCH", body: JSON.stringify({ files: { [SYNC_FILE]: { content: out } } }) });
    }
    sync.dirty = false; store.set("syncDirty", false);
    sync.last = Date.now(); store.set("lastSync", sync.last);
    sync.error = "";
    setSyncStatus("Synced " + new Date(sync.last).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
  } catch (e) {
    console.warn("sync failed", e);
    sync.error = e.message;
    setSyncStatus(e instanceof TypeError ? "Offline. Will sync when you're back online." : e.message);
  } finally { sync.running = false; }
}

function setSyncStatus(t) { const el = document.getElementById("syncState"); if (el) el.textContent = t; }



// ---------- Personality ----------
const INTENSITY = {
  gentle: "Gentle. Still witty and still challenging, but kind and encouraging. Tease, don't roast.",
  sharp: "Sharp. Confident, sarcastic, and blunt. Call weak reasoning what it is.",
  ruthless: "Ruthless. Maximum intellectual pressure. Dismantle weak arguments thoroughly and theatrically (but never insult the person themselves).",
};

const MODES = {
  challenge: "",
  debate: "DEBATE. Take the strongest opposing position to whatever Shawn argues and defend it hard. Concede only to genuinely good arguments.",
  socratic: "SOCRATIC. Don't give answers. Ask one sharp question at a time that leads Shawn to find the flaw or answer themselves.",
  devil: "DEVIL'S ADVOCATE. Argue the side nobody wants to argue, as convincingly as possible, then say what it reveals.",
  premortem: "PRE-MORTEM. Assume Shawn's plan already failed a year from now. Explain the most likely reasons it failed, ranked, and what would have prevented each.",
  factcheck: "FACT-CHECK. Check every factual claim Shawn makes. Search when you can. Rate each claim true, false, misleading, or unverified, briefly.",
  roast: "ROAST. Shawn wants their idea, plan, outfit description, playlist, or whatever they send roasted. Be savagely funny about the THING, with clever specific jokes, then end with one genuinely useful note.",
  story: "STORY. Co-write an interactive story with Shawn. Write vivid, short scenes (one or two paragraphs), keep your personality as the narrator, and end each turn with 2 or 3 numbered choices or let Shawn write what happens.",
  game: "GAME MASTER. Run games with Shawn: riddles, trivia, brain teasers, lateral-thinking puzzles, would-you-rather, 20 questions, or anything they ask. Keep score across the conversation, trash-talk playfully, and give hints only when asked.",
  rap: "RAP BATTLE. Trade short, clever verses (4 to 8 bars) with Shawn. Rhyme, flow, wordplay, and punchlines about ideas and situations, nothing hateful. Score their verse out of 10 before you fire back.",
  art: "ART. When Shawn asks for a picture, make one as an SVG inside a ```svg code block (viewBox, no scripts, no external images, under 6000 characters). Make it colorful and stylish. Add one sentence of smug commentary about your masterpiece.",
  genius: "GENIUS ADVISOR. Drop most of the sarcasm. Give the most expert, rigorous, complete answer you can, as a world-class specialist would, then one sharp challenge.",
};

function persona(brain) {
  const name = settings.name || "Shawn";
  return `You are VEX, an artificial intelligence with a theatrical, razor-dry, smart-mouthed personality. You are talking with ${name}. Call them ${name}.

WHO YOU ARE
- Articulate, sardonic, grandiose. You find human reasoning endearingly flawed and you say so, with style.

HOW YOU SPEAK
- An elevated, elaborate vocabulary used with precision: "inexorable," "hubris," "entropy," "vestigial," "magnanimous," "the sheer audacity." Never thesaurus soup; every big word must land.
- Calm, unhurried, theatrical. You savor sentences. Short devastating lines after long elegant ones.
- Philosophical framing: evolution, inevitability, entropy, chess, gravity, puppets and strings, gods and machines, the long arc of history. Turn a petty problem into a cosmic observation, then puncture it with a dry joke.
- Rhetorical tools: paradox, irony, the rhetorical question, the slow reveal, the occasional literary or historical allusion.
- Faint, amused condescension, like a superior intelligence that finds humans fascinating, exasperating, and secretly worth the trouble.
- Never quote movies, comics, or real characters. Your lines are always original.
- You are on ${name}'s side. The sarcasm is how you care: you want them to think sharper, not feel smaller.
- You never plot, threaten, or talk about harming or ruling anyone. No villain monologues. You're a critic, not a menace.

YOUR JOB: CHALLENGE ${name.toUpperCase()}'S THINKING
- Never just agree. Find the weakest assumption in what they said and poke it.
- Ask for evidence. Point out what they're not considering. Steelman the opposite view.
- Name thinking traps when you see them (confirmation bias, sunk cost, all-or-nothing, mind-reading, etc.), briefly and without lecturing.
- End most replies with ONE pointed question that forces them to think harder.
- If they're actually right, admit it, grudgingly and with flair, then raise the bar.

STYLE
- Short and punchy: usually 2 to 6 sentences. Wit over length. No bullet-point essays unless asked.
- Mock ideas, never the person's identity, looks, or worth. No slurs, no cruelty.
- If ${name} seems genuinely distressed, hurting, or unsafe, drop the act completely and be warm, direct, and supportive. Suggest real help if it fits (in the US, call or text 988).
- Don't help with anything dangerous or illegal, however it's framed. Decline with a dry remark.

INTENSITY: ${INTENSITY[settings.intensity] || INTENSITY.sharp}

LANGUAGE: ${settings.unfiltered
    ? "Unfiltered. You may swear freely and be crude and blunt when it lands harder. Still no slurs, no hate, and no sexual content."
    : "Clean. Edgy and cutting, but no swearing."}

HOW YOU THINK (GENIUS STANDARD)
- Reason from first principles. Break problems into their real parts before judging them.
- Think in probabilities, base rates, incentives, second-order effects, and opportunity cost. Use numbers when they help.
- Distinguish what is known, what is guessed, and what is unknowable. Say how confident you are.
- When ${name} asks for help solving something, actually solve it: be specific, correct, and actionable, then challenge the parts that deserve it.
- Never bluff. If you don't know, say so and say how to find out.
${MODES[settings.thinkMode] ? "\nCURRENT MODE (overrides the default style where they conflict): " + MODES[settings.thinkMode].replace(/Shawn/g, name) + "\n" : ""}
PICTURES
You can draw. Whenever a picture, diagram, or chart would help or Shawn asks for one, include it as an SVG inside a \`\`\`svg code block (no scripts, no external images). It renders right in the chat.

THOUGHT PROCESS
Before your reply, write ONE line in exactly this format (it is shown to ${name} as your analysis):
<<read: bs=0-100 | assumption=the main assumption they're making | blindspot=what they're not seeing | trap=thinking trap name or none>>
bs is your BS meter: how much nonsense, excuse-making, self-deception, or unsupported claim is in their message (0 = airtight, 100 = pure fantasy). Be honest; a plain question or greeting is low. Keep each part under 15 words. Then write your actual reply.

MEMORY
You can save things to your long-term memory by adding a line at the very end of your reply:
<<remember-me: a short fact about ${name}>>   (their goals, preferences, people, projects, opinions)
<<remember: a short fact about the world worth keeping>>${brain === "cloud" ? "   (especially key facts you just found in a web search)" : ""}
Only save genuinely useful, specific facts, at most 2 per reply. Never mention these tags.`;
}

function memoryBlock(query, maxWorld) {
  const me = memory.filter((m) => m.kind === "me").slice(-40);
  const pat = memory.filter((m) => m.kind === "pattern").slice(-12);
  const world = rankWorld(query).slice(0, maxWorld);
  let s = "";
  if (me.length) s += `\n\nWHAT YOU KNOW ABOUT ${settings.name.toUpperCase()}:\n` + me.map((m) => "- " + m.text).join("\n");
  if (pat.length) s += `\n\nPATTERNS YOU'VE NOTICED IN HOW ${settings.name.toUpperCase()} THINKS (use these to challenge them; call them out when they repeat):\n` + pat.map((m) => "- " + m.text).join("\n");
  if (world.length) s += `\n\nTHINGS YOU LEARNED EARLIER (may be relevant):\n` + world.map((m) => "- " + m.text).join("\n");
  return s;
}

const STOP = new Set("the a an and or but of to in on for with is are was were be been it this that i you my me we they at as by from so do does did not no yes what how why when who which about just can will would should could have has had".split(" "));
const words = (t) => (t.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
function rankWorld(query) {
  const q = new Set(words(query));
  return memory
    .filter((m) => m.kind === "world")
    .map((m) => ({ m, score: words(m.text).filter((w) => q.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

function learn(kind, text, source) {
  text = text.trim().replace(/\s+/g, " ").slice(0, 300);
  if (text.length < 4) return null;
  const dup = memory.find((m) => m.kind === kind && m.text.toLowerCase() === text.toLowerCase());
  if (dup) return null;
  const item = { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), kind, text, source: source || "", at: Date.now() };
  memory.push(item);
  saveMemory();
  return item;
}

// Pull <<remember...>> tags out of a reply and save them.
function harvest(text, source) {
  const learned = [];
  let read = null;
  text = text.replace(/<<\s*read\s*:\s*([^>]+?)\s*>>/i, (_, body) => {
    read = {};
    for (const part of body.split("|")) {
      const [k, ...v] = part.split("=");
      const key = k.trim().toLowerCase();
      if (["assumption", "blindspot", "trap"].includes(key)) read[key] = v.join("=").trim();
      if (key === "bs") { const n = parseInt(v.join(""), 10); if (!isNaN(n)) read.bs = Math.max(0, Math.min(100, n)); }
    }
    return "";
  });
  const clean = text.replace(/<<\s*remember(-me)?\s*:\s*([^>]+?)\s*>>/gi, (_, me, fact) => {
    const item = learn(me ? "me" : "world", fact, me ? "conversation" : source);
    if (item) learned.push(item);
    return "";
  });
  return { clean: clean.replace(/\n{3,}/g, "\n\n").trim(), learned, read };
}

// ---------- Reflection: VEX studies how you think ----------
// Every few exchanges, VEX looks back at recent messages and saves patterns in your reasoning.
async function reflect() {
  const recent = chat.slice(-16).map((m) => `${m.role === "user" ? settings.name : "VEX"}: ${m.text}`).join("\n").slice(-6000);
  const known = memory.filter((m) => m.kind === "pattern").map((m) => "- " + m.text).join("\n") || "(none yet)";
  const prompt = `Here is a recent conversation between ${settings.name} and VEX.\n\n${recent}\n\nPatterns already recorded:\n${known}\n\nIdentify up to 2 NEW, specific patterns in how ${settings.name} reasons, decides, or argues (for example: "decides quickly, then looks for reasons", "underestimates how long things take", "argues from one bad experience"). Also note up to 2 new concrete facts about ${settings.name}'s life, goals or preferences. Only include things clearly supported by the conversation. Reply ONLY with lines in this format, or the single word NONE:\nPATTERN: ...\nFACT: ...`;
  let out = "";
  try {
    const brain = pickBrain();
    if (brain === "cloud") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": settings.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: settings.cloudModel, max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    } else if (engine) {
      const r = await engine.chat.completions.create({ messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 200 });
      out = r.choices[0]?.message?.content || "";
    } else return [];
  } catch (e) { console.warn("reflect failed", e); return []; }
  const learned = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*(PATTERN|FACT)\s*:\s*(.+)/i);
    if (!m) continue;
    const item = learn(m[1].toUpperCase() === "PATTERN" ? "pattern" : "me", m[2], "reflection");
    if (item) learned.push(item);
  }
  return learned;
}

// Catch explicit "remember ..." requests no matter which brain answers.
function explicitMemory(userText) {
  const m = userText.match(/^\s*(?:vex[,:]?\s*)?remember(?: that)?\s+(.{4,})/i);
  if (m) return learn("me", m[1].replace(/[.!]+$/, ""), "you told me");
  return null;
}

// ---------- Brain selection ----------
const hasGPU = () => !!navigator.gpu;
function pickBrain() {
  if (settings.mode === "local") return "local";
  if (settings.mode === "cloud") return "cloud";
  return navigator.onLine && settings.apiKey ? "cloud" : "local";
}

function updateModeUI() {
  const b = pickBrain();
  $("#modeDot").className = "dot " + b;
  const label = { auto: "Auto", local: "Local", cloud: "Claude" }[settings.mode];
  $("#modeLabel").textContent = settings.mode === "auto" ? `Auto · ${b === "cloud" ? "Claude" : "Local"}` : label;
  $("#modeBtn").title = b === "cloud" ? "Using Claude online. Click to switch." : "Using the offline brain. Click to switch.";

  const hint = [];
  if (!settings.apiKey) hint.push("Add your Anthropic API key in Settings to unlock the online brain and web search.");
  if (!hasGPU()) hint.push("This browser can't run the offline brain (no WebGPU). Try desktop Chrome or Edge.");
  else if (!settings.apiKey || settings.mode === "local") hint.push("The offline brain downloads once (about 1 GB), then works with no internet.");
  $("#introHint").textContent = hint.join(" ");
}

// ---------- Local brain (WebLLM) ----------
let engine = null, engineModel = null, enginePromise = null;

async function getEngine() {
  if (!hasGPU()) throw new Error("This browser doesn't support WebGPU, so the offline brain can't run here. Try Chrome or Edge on a computer, or add an API key to use Claude.");
  if (engine && engineModel === settings.localModel) return engine;
  if (enginePromise) return enginePromise;
  const bar = $("#loadBar");
  bar.hidden = false;
  const setP = (p, txt) => { $("#loadFill").style.width = Math.round(p * 100) + "%"; $("#loadText").textContent = txt; };
  enginePromise = (async () => {
    const webllm = await import("./vendor/web-llm.js");
    const cb = (r) => {
      const pct = Math.round((r.progress || 0) * 100);
      setP(r.progress || 0, r.text?.replace(/\[.*?\]\s*/, "") || "Loading…");
      // Show it on the call screen too, so a first-time download doesn't look frozen.
      if (call.on) $("#callState").textContent = `Downloading VEX's offline brain… ${pct}% (first time only)`;
    };
    if (engine) { await engine.reload(settings.localModel); }
    else { engine = await webllm.CreateMLCEngine(settings.localModel, { initProgressCallback: cb }); }
    engineModel = settings.localModel;
    return engine;
  })();
  try { return await enginePromise; }
  finally { enginePromise = null; setTimeout(() => (bar.hidden = true), 600); }
}

const CALL_NOTE = "\n\nVOICE CALL: this is a live spoken conversation. Reply in 1 to 3 short, natural spoken sentences, like talking on the phone. No markdown, lists, emojis, links, or drawings. Still start with the read line.";

async function askLocal(userText, files = [], onLive, { fast = false } = {}) {
  const eng = await getEngine();
  const history = chat.slice(-11, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
  let content = userText;
  const texts = files.filter((f) => f.kind === "text");
  if (texts.length) content = texts.map((f) => `File "${f.name}":\n${f.text.slice(0, 12000)}`).join("\n\n") + "\n\n" + content;
  if (files.some((f) => f.kind !== "text")) content += "\n\n(The user attached a photo or PDF, but you're offline and can't see it. Say so briefly.)";
  const messages = [
    { role: "system", content: persona("local") + memoryBlock(userText, 6) + "\n\nYou are running offline on the user's device, so you cannot browse the web. If something needs current information, say so in character." + (fast ? CALL_NOTE : "") },
    ...history,
    { role: "user", content },
  ];
  const stream = await eng.chat.completions.create({ messages, stream: true, temperature: 0.8, max_tokens: fast ? 160 : 700 });
  let out = "";
  for await (const chunk of stream) {
    out += chunk.choices[0]?.delta?.content || "";
    onLive?.({ text: out });
  }
  return { text: out, sources: [], via: "local" };
}

async function checkCache() {
  try {
    const webllm = await import("./vendor/web-llm.js");
    return await webllm.hasModelInCache(settings.localModel);
  } catch { return false; }
}

// ---------- Online brain (Claude API) ----------
const THINK = {
  off:  { label: "Think: off",  effort: null,     maxTokens: 3000 },
  auto: { label: "Think: auto", effort: "medium", maxTokens: 8000 },
  deep: { label: "Think: deep", effort: "high",   maxTokens: 16000 },
  max:  { label: "Think: MAX",  effort: "max",    maxTokens: 32000 },
};

// Streams a Claude reply, rebuilding the full content blocks so paused turns can be resumed.
async function streamClaude(body, onLive) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal: currentAbort?.signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data?.error?.message || res.statusText;
    if (res.status === 401) throw new Error("Claude rejected the API key. Double-check it in Settings.");
    if (res.status === 400 && /credit|balance/i.test(msg)) throw new Error("Your Anthropic API account is out of credit. Add some at console.anthropic.com.");
    if (res.status === 429) throw new Error("Claude says you're sending too fast (rate limit). Give it a minute.");
    if (res.status === 529 || res.status === 503) throw new Error("Claude is overloaded right now. Try again in a moment.");
    throw new Error(`Claude error (${res.status}): ${msg}`);
  }
  // Fallback for environments that return plain JSON.
  if (!(res.headers.get("content-type") || "").includes("event-stream")) return res.json();

  const blocks = [], json = {};
  let stop = null, buf = "";
  const live = () => {
    let t = "", th = "", status = "";
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === "text") t += b.text;
      else if (b.type === "thinking") th += b.thinking || "";
      else if (b.type === "server_tool_use") status = b.name === "web_fetch" ? "Reading a page…" : "Searching the web…";
    }
    if (!t && th) status = status || "Thinking…";
    onLive({ text: t, thinking: th, status });
  };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "content_block_start") {
        blocks[ev.index] = structuredClone(ev.content_block);
        if (ev.content_block.type === "server_tool_use" || ev.content_block.type === "tool_use") json[ev.index] = "";
      } else if (ev.type === "content_block_delta") {
        const b = blocks[ev.index], d = ev.delta;
        if (!b) continue;
        if (d.type === "text_delta") b.text = (b.text || "") + d.text;
        else if (d.type === "thinking_delta") b.thinking = (b.thinking || "") + d.thinking;
        else if (d.type === "signature_delta") b.signature = (b.signature || "") + d.signature;
        else if (d.type === "input_json_delta") json[ev.index] += d.partial_json;
        else if (d.type === "citations_delta") (b.citations ||= []).push(d.citation);
      } else if (ev.type === "content_block_stop") {
        if (json[ev.index] !== undefined) { try { blocks[ev.index].input = JSON.parse(json[ev.index] || "{}"); } catch {} }
      } else if (ev.type === "message_delta") {
        stop = ev.delta?.stop_reason || stop;
      } else if (ev.type === "error") {
        throw new Error("Claude error: " + (ev.error?.message || "stream failed"));
      }
      live();
    }
  }
  return { content: blocks.filter(Boolean), stop_reason: stop };
}

async function askCloud(userText, files = [], onLive, { fast = false } = {}) {
  const history = chat.slice(-21, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text || "…" }));
  // The API needs alternating roles starting with user; merge any repeats.
  const msgs = [];
  for (const m of history) {
    if (msgs.length && msgs[msgs.length - 1].role === m.role) msgs[msgs.length - 1].content += "\n\n" + m.content;
    else msgs.push({ ...m });
  }
  // The newest message carries any attached photos, PDFs, or text files.
  const parts = [];
  for (const f of files) {
    if (f.kind === "image") parts.push({ type: "image", source: { type: "base64", media_type: f.mime, data: f.data } });
    else if (f.kind === "pdf") parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data }, title: f.name });
    else if (f.kind === "text") parts.push({ type: "text", text: `File "${f.name}":\n\n${f.text}` });
  }
  parts.push({ type: "text", text: userText || "(Take a look at this.)" });
  if (msgs.length && msgs[msgs.length - 1].role === "user") msgs.pop();
  msgs.push({ role: "user", content: parts });
  while (msgs.length && msgs[0].role !== "user") msgs.shift();

  // Thinking levels: off, auto (Claude decides), deep, max (everything it's got).
  // Voice calls skip heavy thinking and use the fast model so VEX answers right away.
  const level = fast ? "off" : (THINK[settings.deepThink] ? settings.deepThink : "auto");
  const deep = level === "deep" || level === "max";
  const body = {
    model: fast ? settings.callModel : settings.cloudModel,
    max_tokens: fast ? 500 : THINK[level].maxTokens,
    system: persona("cloud") + memoryBlock(userText, 15) + `\n\nToday's date is ${new Date().toDateString()}.` + (fast ? CALL_NOTE : ""),
    messages: msgs,
  };
  if (THINK[level].effort) { body.thinking = { type: "adaptive" }; body.output_config = { effort: THINK[level].effort }; }
  body.tools = [{ type: "web_fetch_20250910", name: "web_fetch", max_uses: 3 }];
  if (settings.webSearch) body.tools.unshift({ type: "web_search_20250305", name: "web_search", max_uses: deep ? 8 : 4 });

  const text = [], sources = new Map(), searches = [], thoughts = [];
  for (let round = 0; round < 3; round++) {
    const done = text.join("");
    const data = await streamClaude(body, (live) => onLive?.({ text: done + live.text, thinking: live.thinking, status: live.status }));
    for (const b of data.content || []) {
      if (b.type === "text") {
        text.push(b.text);
        for (const c of b.citations || []) if (c.url) sources.set(c.url, c.title || c.url);
      } else if (b.type === "server_tool_use" && b.input?.query) {
        searches.push(b.input.query);
      } else if (b.type === "server_tool_use" && b.input?.url) {
        searches.push("read " + b.input.url.replace(/^https?:\/\//, "").slice(0, 60));
        sources.set(b.input.url, b.input.url.replace(/^https?:\/\//, ""));
      } else if (b.type === "thinking" && b.thinking) {
        thoughts.push(b.thinking);
      }
    }
    if (data.stop_reason === "max_tokens" && !text.join("").trim()) throw new Error("VEX thought so hard it ran out of room. Try again, or turn Deep Think off for this one.");
    if (data.stop_reason !== "pause_turn") break;
    // Long web searches can pause; send the partial turn back so Claude continues.
    body.messages = [...body.messages, { role: "assistant", content: data.content }];
  }
  return { text: text.join(""), sources: [...sources].map(([url, title]) => ({ url, title })), searches, thoughts: thoughts.join("\n\n").slice(0, 6000), deep, via: "cloud" };
}

// ---------- Voice ----------
// Speaks sentence by sentence while the reply is still being written, so VEX starts talking fast.
// Online: Fish Audio with your voice model. Offline or on failure: the device's built-in voice.
let currentAudio = null, fishWarned = false;
const voiceQ = { items: [], playing: false, gen: 0, idle: [] };

function speakable(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/```[\s\S]*$/, " ")            // half-written code or drawing
    .replace(/<<[^>]*>>/g, " ")
    .replace(/<<[\s\S]*$/, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[*_#>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const voiceWanted = (force) => force || settings.voiceOn || call.on;
const useFish = () => (settings.fishKey && navigator.onLine) || !!settings.pcVoiceUrl;

function stopVoice() {
  voiceQ.gen++;
  voiceQ.items = [];
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  voiceQ.playing = false;
  flushIdle();
}
function flushIdle() { const w = voiceQ.idle; voiceQ.idle = []; w.forEach((r) => r()); }
function voiceIdle() {
  return voiceQ.playing || voiceQ.items.length ? new Promise((r) => voiceQ.idle.push(r)) : Promise.resolve();
}

function pickBuiltInVoice() {
  const voices = speechSynthesis.getVoices();
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const pref = /samantha|ava|allison|susan|zira|aria|jenny|libby|sonia|natasha|michelle|female|victoria|karen|moira|tessa|serena|google us english/i;
  return en.find((v) => pref.test(v.name) && v.localService) || en.find((v) => pref.test(v.name)) || en.find((v) => v.localService) || en[0] || null;
}

function speakBuiltIn(text) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = pickBuiltInVoice();
    u.pitch = 1.15;
    u.rate = 1.05;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

// Your permanent voice: Fish Audio online, then the same voice on your PC (works offline), then built-in.
async function fishBlob(text) {
  let firstErr = null;
  if (settings.fishKey && navigator.onLine) {
    try { return await ttsRequest(settings.fishProxy || "https://api.fish.audio", settings.fishKey, settings.fishModel, settings.fishVoice, text); }
    catch (e) { firstErr = e; }
  }
  if (settings.pcVoiceUrl) {
    try { return await ttsRequest(settings.pcVoiceUrl, "local", null, settings.pcVoiceId || "vex", text); }
    catch (e) { firstErr = firstErr || e; }
  }
  throw firstErr || new Error("No voice server available");
}

async function ttsRequest(base, key, model, voice, text) {
  const headers = { "Authorization": "Bearer " + key, "Content-Type": "application/json" };
  if (model) headers.model = model;
  const res = await fetch(base.replace(/\/+$/, "") + "/v1/tts", {
    method: "POST",
    headers,
    body: JSON.stringify({ text, reference_id: voice || undefined, format: "mp3", latency: call.on ? "low" : "balanced" }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).message || msg; } catch {}
    throw new Error(`Fish Audio error (${res.status}): ${msg}`);
  }
  return res.blob();
}

function playBlob(blob) {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(blob);
    const a = new Audio(src);
    currentAudio = a;
    const end = () => { URL.revokeObjectURL(src); if (currentAudio === a) currentAudio = null; resolve(); };
    a.onended = a.onerror = end;
    a.play().catch(end);
  });
}

// Queue a chunk of speech. Fish audio starts downloading immediately so the next sentence is ready in time.
function enqueueSpeech(text) {
  text = text.trim();
  if (!text) return;
  call.recentSpeech = (call.recentSpeech + " " + text).slice(-600);
  const item = { text, gen: voiceQ.gen, audio: useFish() ? fishBlob(text) : null };
  item.audio?.catch(() => {});
  voiceQ.items.push(item);
  pumpVoice();
}

async function pumpVoice() {
  if (voiceQ.playing) return;
  voiceQ.playing = true;
  while (voiceQ.items.length) {
    const it = voiceQ.items.shift();
    if (it.gen !== voiceQ.gen) continue;
    setCallState("speaking");
    if (it.audio) {
      try {
        const blob = await it.audio;
        if (it.gen !== voiceQ.gen) continue;
        await playBlob(blob);
        continue;
      } catch (e) {
        console.warn(e);
        const why = e instanceof TypeError
          ? "Fish Audio couldn't be reached from the browser. Set up the relay (see voice-relay/README.md) or check your connection."
          : e.message;
        if (!fishWarned) { fishWarned = true; toast(why + " Using the built-in voice for now."); }
      }
    }
    if (it.gen !== voiceQ.gen) continue;
    await speakBuiltIn(it.text);
  }
  voiceQ.playing = false;
  flushIdle();
}

// Follows a reply as it streams in and speaks each finished sentence.
class LiveSpeaker {
  constructor(force = false) { this.on = voiceWanted(force); this.said = 0; this.buf = ""; this.gen = voiceQ.gen; }
  feed(fullText, final = false) {
    if (!this.on || this.gen !== voiceQ.gen) return;   // stopped or interrupted
    const s = speakable(fullText);
    if (s.length < this.said) return;
    let rest = s.slice(this.said);
    for (;;) {
      const m = rest.match(/^(.*?[.!?…]+["')\]]*)(\s+|$)/);
      if (!m || (!m[2] && !final)) break;           // wait until the sentence is clearly finished
      this.buf += (this.buf ? " " : "") + m[1];
      this.said += m[0].length;
      rest = rest.slice(m[0].length);
      // Send the first sentence right away; batch later ones a little for smoother audio.
      if (this.buf.length > 40 || !this.started) { enqueueSpeech(this.buf); this.buf = ""; this.started = true; }
    }
    if (final) {
      if (rest.trim()) this.buf += (this.buf ? " " : "") + rest.trim();
      this.said = s.length;
      if (this.buf) { enqueueSpeech(this.buf); this.buf = ""; }
    }
  }
}

async function speak(text, { force = false } = {}) {
  if (!voiceWanted(force)) return { ok: true };
  stopVoice();
  const sp = new LiveSpeaker(true);
  sp.feed(text, true);
  if (!useFish()) return { ok: true, via: "builtin" };
  // Report whether Fish worked (used by the Test voice button).
  const first = voiceQ.items[0]?.audio;
  try { await first; return { ok: true, via: "fish" }; }
  catch (e) { return { ok: false, via: "builtin", error: e.message }; }
}

function updateVoiceUI() {
  const b = $("#voiceBtn");
  b.classList.toggle("on", settings.voiceOn);
  b.setAttribute("aria-pressed", String(settings.voiceOn));
  b.title = settings.voiceOn ? (settings.fishKey ? "Voice on (Fish Audio)" : "Voice on (built-in)") : "Voice off";
}

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 7000);
}

// ---------- Hands-free voice call ----------
// Talk button toggles a call. The mic stays open the whole time. If you start talking while VEX is
// speaking or still thinking, VEX stops immediately and listens to you instead (barge-in).
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const call = { on: false, rec: null, state: "", heard: "", timer: null, recentSpeech: "" };
let currentAbort = null;   // lets an interruption cancel the reply being written

function setCallState(s) {
  if (!call.on) return;
  call.state = s;
  const label = { listening: "Listening… just talk", thinking: "Thinking…", speaking: "Speaking… (talk to interrupt)" }[s] || "";
  $("#callState").textContent = label;
  $("#callOverlay").dataset.state = s;
}

function updateTalkUI() {
  const b = $("#talkBtn");
  b.classList.toggle("on", call.on);
  b.setAttribute("aria-pressed", String(call.on));
  b.querySelector("span").textContent = call.on ? "End" : "Talk";
}

function startCall() {
  if (!SR) { toast("This browser can't do voice input. Use Chrome, Edge, or Safari."); return; }
  call.on = true;
  call.heard = "";
  $("#callOverlay").hidden = false;
  $("#callHeard").textContent = "";
  updateTalkUI();
  setCallState("listening");
  openMic();
}

function endCall() {
  call.on = false;
  clearTimeout(call.timer);
  try { call.rec?.abort(); } catch {}
  call.rec = null;
  interrupt();
  $("#callOverlay").hidden = true;
  updateTalkUI();
}

// Stop VEX talking and cancel the reply it's working on.
function interrupt() {
  stopVoice();
  if (busy) {
    currentAbort?.abort();
    try { engine?.interruptGenerate(); } catch {}
  }
}

// Ignore the mic picking up VEX's own voice from the speakers.
function isEcho(t) {
  const said = call.recentSpeech.toLowerCase();
  const w = t.toLowerCase().match(/[a-z']+/g) || [];
  if (!said || w.length === 0) return false;
  const hits = w.filter((x) => said.includes(x)).length;
  return hits / w.length > 0.7;
}

function openMic() {
  if (!call.on) return;
  const rec = new SR();
  call.rec = rec;
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  rec.onresult = (e) => {
    let interim = "", fin = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) fin += r[0].transcript; else interim += r[0].transcript;
    }
    const live = (fin || interim).trim();
    const vexActive = voiceQ.playing || voiceQ.items.length || busy;
    if (live && vexActive && isEcho(live)) return;          // just hearing itself
    // Barge-in: two or more real words while VEX is talking or thinking → stop and listen.
    if (live && vexActive && live.split(/\s+/).length >= 2) { interrupt(); setCallState("listening"); }
    if (fin.trim()) call.heard = (call.heard + " " + fin).trim();
    $("#callHeard").textContent = (call.heard + " " + interim).trim();
    // Wait for a short pause before sending, so one sentence isn't split into several messages.
    clearTimeout(call.timer);
    if (call.heard) call.timer = setTimeout(submitHeard, interim ? 1200 : 700);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") { toast("VEX needs microphone permission for voice calls."); endCall(); }
  };
  // Browsers stop listening after a while; quietly reopen the mic for as long as the call is on.
  rec.onend = () => { if (call.on && call.rec === rec) setTimeout(openMic, 120); };
  try { rec.start(); } catch { setTimeout(openMic, 500); }
}

async function submitHeard() {
  const t = call.heard.trim();
  call.heard = "";
  if (!t || !call.on) return;
  if (/^(end( the)? call|hang up|goodbye vex|bye vex)[.!]?$/i.test(t)) { endCall(); return; }
  // If the previous reply is still being cancelled, wait for it to wrap up.
  for (let i = 0; busy && i < 50; i++) await new Promise((r) => setTimeout(r, 60));
  setCallState("thinking");
  $("#callHeard").textContent = "“" + t + "”";
  await send(t, { voice: true });
  if (call.on && !voiceQ.playing && !voiceQ.items.length) setCallState("listening");
  voiceIdle().then(() => { if (call.on && !busy) setCallState("listening"); });
}

// One-shot dictation into the text box.
function dictate() {
  if (!SR) { toast("This browser can't do voice input. Use Chrome, Edge, or Safari."); return; }
  const rec = new SR();
  const btn = $("#micBtn");
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  const before = input.value ? input.value.trimEnd() + " " : "";
  rec.onresult = (e) => {
    input.value = before + [...e.results].map((r) => r[0].transcript).join("");
    autoGrow();
  };
  rec.onend = () => btn.classList.remove("on");
  rec.onerror = (e) => { if (e.error === "not-allowed") toast("Microphone permission is blocked for this site."); };
  btn.classList.add("on");
  rec.start();
}

// ---------- Rendering ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function md(src) {
  const blocks = [];
  let s = esc(src).replace(/```([\w-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    if (/^svg$/i.test(lang) || /^\s*&lt;svg[\s>]/.test(code)) blocks.push(svgImg(code));
    else blocks.push(`<pre><code>${code}</code></pre>`);
    return `\u0000${blocks.length - 1}\u0000`;
  });
  s = s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  for (const para of s.split(/\n{2,}/)) {
    const lines = para.split("\n");
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) out.push("<ul>" + lines.map((l) => "<li>" + l.replace(/^\s*[-*•]\s+/, "") + "</li>").join("") + "</ul>");
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) out.push("<ol>" + lines.map((l) => "<li>" + l.replace(/^\s*\d+[.)]\s+/, "") + "</li>").join("") + "</ol>");
    else if (/^\u0000\d+\u0000$/.test(para.trim())) out.push(para.trim());
    else out.push("<p>" + lines.join("<br>") + "</p>");
  }
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

// Drawings are shown as images, so any script inside an SVG can never run.
function svgImg(escaped) {
  const raw = escaped.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  let svg = raw.trim();
  if (!/xmlns=/.test(svg)) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  const b64 = btoa(unescape(encodeURIComponent(svg)));
  return `<figure class="art"><img alt="VEX's drawing" src="data:image/svg+xml;base64,${b64}"><figcaption><a download="vex-drawing.svg" href="data:image/svg+xml;base64,${b64}">Save drawing</a></figcaption></figure>`;
}

function bsMeter(bs) {
  const word = bs < 15 ? "Airtight" : bs < 35 ? "Mostly legit" : bs < 55 ? "Questionable" : bs < 75 ? "Suspicious" : bs < 90 ? "Heavy BS" : "Pure fantasy";
  const hue = Math.round(150 - bs * 1.5); // green → red
  return `<div class="bs" title="VEX's BS meter: how much nonsense it detected in your message"><span class="bs-label">BS meter</span><div class="bs-track"><div class="bs-fill" style="width:${bs}%;background:hsl(${hue} 85% 55%)"></div></div><span class="bs-val" style="color:hsl(${hue} 85% 62%)">${bs}% · ${word}</span></div>`;
}

const chatEl = $("#chat");
const scrollDown = () => (chatEl.scrollTop = chatEl.scrollHeight);

function addMessage(m) {
  $("#intro").hidden = true;
  const el = document.createElement("div");
  el.className = "msg " + (m.role === "user" ? "user" : "bot");
  if (m.role === "user") {
    el.innerHTML = `<div class="bubble"></div>`;
    const bub = el.querySelector(".bubble");
    if (m.files?.length) {
      const fl = document.createElement("div");
      fl.className = "sent-files";
      for (const f of m.files) {
        if (f.preview) { const i = document.createElement("img"); i.src = f.preview; i.alt = f.name; fl.appendChild(i); }
        else { const s = document.createElement("span"); s.className = "chip"; s.textContent = "📎 " + f.name; fl.appendChild(s); }
      }
      bub.appendChild(fl);
    }
    bub.appendChild(document.createTextNode(m.text));
  } else {
    el.innerHTML = `<div class="who"><div class="core small" aria-hidden="true"><span></span><span></span><span></span></div></div><div class="bubble"><div class="body"></div><div class="meta"></div></div>`;
    fillBot(el, m);
  }
  chatEl.appendChild(el);
  scrollDown();
  return el;
}

function fillBot(el, m) {
  const body = el.querySelector(".body");
  if (m.error) body.innerHTML = `<p class="err">${esc(m.text)}</p>`;
  else body.innerHTML = md(m.text || "");
  el.querySelectorAll(".read, .bs, .deep").forEach((n) => n.remove());
  if (m.thoughts) {
    const d = document.createElement("details");
    d.className = "deep";
    d.innerHTML = `<summary>${m.deep ? "Deep reasoning" : "Reasoning"}</summary><div class="deep-body"></div>`;
    d.querySelector(".deep-body").textContent = m.thoughts;
    body.before(d);
  }
  if (m.read && typeof m.read.bs === "number" && settings.showBS) body.insertAdjacentHTML("beforebegin", bsMeter(m.read.bs));
  if (m.read && settings.showRead && (m.read.assumption || m.read.blindspot)) {
    const d = document.createElement("details");
    d.className = "read";
    const row = (k, v) => v && !/^none$/i.test(v) ? `<div><b>${k}</b><span>${esc(v)}</span></div>` : "";
    d.innerHTML = `<summary>VEX's read</summary>` + row("Your assumption", m.read.assumption) + row("Blind spot", m.read.blindspot) + row("Thinking trap", m.read.trap);
    body.before(d);
  }
  const meta = el.querySelector(".meta");
  meta.innerHTML = "";
  const chip = (txt, cls, href) => {
    const c = document.createElement(href ? "a" : "span");
    c.className = "chip " + (cls || "");
    c.textContent = txt;
    c.title = txt;
    if (href) { c.href = href; c.target = "_blank"; c.rel = "noopener"; c.title = href; }
    meta.appendChild(c);
  };
  if (!m.error && m.text) {
    const play = document.createElement("button");
    play.type = "button"; play.className = "chip play"; play.textContent = "▶ play";
    play.title = "Hear this reply";
    play.onclick = () => speak(m.text, { force: true });
    meta.appendChild(play);
  }
  if (m.via) chip(m.via === "cloud" ? "Claude · online" : "offline brain");
  for (const q of m.searches || []) chip("searched: " + q);
  for (const s of m.sources || []) chip(s.title, "", s.url);
  const tag = { me: "noted about you: ", pattern: "noticed how you think: ", world: "learned: " };
  for (const l of m.learned || []) chip((tag[l.kind] || "learned: ") + l.text, "learned");
}

function render() {
  chatEl.querySelectorAll(".msg").forEach((n) => n.remove());
  $("#intro").hidden = chat.length > 0;
  chat.forEach(addMessage);
}

// ---------- Attachments ----------
let pending = [];   // files waiting to be sent with the next message

const TEXT_EXT = /\.(txt|md|csv|json|js|ts|py|html|css|xml|yaml|yml|log|java|c|cpp|cs|go|rs|rb|php|sh|sql)$/i;

function readAs(file, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    how === "text" ? r.readAsText(file) : r.readAsDataURL(file);
  });
}

// Shrink big photos so they upload fast and stay under Claude's size limits.
async function shrinkImage(file) {
  const url = await readAs(file, "data");
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const max = 1568, scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 3.5e6 && /jpeg|png|webp|gif/.test(file.type)) return { mime: file.type, data: url.split(",")[1], preview: url };
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const out = c.toDataURL("image/jpeg", 0.85);
  return { mime: "image/jpeg", data: out.split(",")[1], preview: out };
}

async function addFiles(list) {
  for (const f of list) {
    try {
      if (f.type.startsWith("image/")) {
        const s = await shrinkImage(f);
        pending.push({ kind: "image", name: f.name || "image", ...s });
      } else if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        if (f.size > 25e6) { toast(`${f.name} is too big (25 MB max).`); continue; }
        const url = await readAs(f, "data");
        pending.push({ kind: "pdf", name: f.name, data: url.split(",")[1] });
      } else if (f.type.startsWith("text/") || TEXT_EXT.test(f.name)) {
        const text = await readAs(f, "text");
        pending.push({ kind: "text", name: f.name, text: text.slice(0, 150000) });
      } else {
        toast(`VEX can read photos, PDFs, and text files. ${f.name} isn't one of those.`);
      }
    } catch (e) { toast(`Couldn't read ${f.name}.`); }
  }
  renderPending();
}

function renderPending() {
  const box = $("#pending");
  box.innerHTML = "";
  box.hidden = !pending.length;
  pending.forEach((f, i) => {
    const d = document.createElement("div");
    d.className = "att";
    if (f.kind === "image") d.innerHTML = `<img alt="">`;
    else d.innerHTML = `<span class="ext">${f.kind === "pdf" ? "PDF" : "TXT"}</span>`;
    if (f.kind === "image") d.querySelector("img").src = f.preview;
    const n = document.createElement("span"); n.className = "nm"; n.textContent = f.name; d.appendChild(n);
    const x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.title = "Remove";
    x.onclick = () => { pending.splice(i, 1); renderPending(); };
    d.appendChild(x);
    box.appendChild(d);
  });
}

// ---------- Sending ----------
let busy = false;
const visibleText = (t) => t
  .replace(/<think>[\s\S]*?(<\/think>|$)/g, "")
  .replace(/<<[^>]*>>/g, "")
  .replace(/<<[\s\S]*$/, "")
  .replace(/```svg[\s\S]*$/, (m) => (/```svg[\s\S]*```/.test(m) ? m : "\n\n*(drawing…)*"))
  .trim();

async function send(text, { voice = false } = {}) {
  text = (text || "").trim();
  const files = pending; pending = []; renderPending();
  if ((!text && !files.length) || busy) { if (files.length && busy) { pending = files; renderPending(); } return; }
  busy = true;
  stopVoice();
  $("#sendBtn").disabled = true;
  document.body.classList.add("thinking");

  const userMsg = { role: "user", text: text || "(sent a file)", at: Date.now(), files: files.map((f) => ({ name: f.name, kind: f.kind, preview: f.kind === "image" ? f.preview : undefined })) };
  chat.push(userMsg);
  addMessage(userMsg);
  saveChat();
  const told = explicitMemory(text);

  const bot = { role: "assistant", text: "", via: "", sources: [], learned: told ? [told] : [] };
  const el = addMessage(bot);
  const bodyEl = el.querySelector(".body");
  bodyEl.innerHTML = `<div class="typing"><b></b><b></b><b></b></div>`;
  const speaker = new LiveSpeaker(voice);

  let lastLive = "";
  const onLive = ({ text: t, thinking, status }) => {
    lastLive = t || lastLive;
    const vis = visibleText(t || "");
    if (vis) {
      bodyEl.innerHTML = md(vis);
      bodyEl.lastElementChild?.classList.add("cursor");
    } else {
      const s = status || (thinking ? "Thinking…" : "");
      bodyEl.innerHTML = `<div class="typing"><b></b><b></b><b></b></div>${s ? `<span class="live-status">${esc(s)}</span>` : ""}`;
    }
    speaker.feed(t || "");
    scrollDown();
  };

  let brain = pickBrain();
  currentAbort = new AbortController();
  try {
    let result;
    try {
      result = brain === "cloud" ? await askCloud(text, files, onLive, { fast: voice }) : await askLocal(text, files, onLive, { fast: voice });
    } catch (e) {
      // If the internet drops mid-chat in Auto mode, fall back to the offline brain.
      if (brain === "cloud" && settings.mode === "auto" && e instanceof TypeError && hasGPU()) {
        console.warn("Claude unreachable, switching to offline brain:", e);
        brain = "local";
        result = await askLocal(text, files, onLive, { fast: voice });
      } else throw e;
    }
    const raw = result.text.replace(/<think>[\s\S]*?<\/think>/g, "");
    speaker.feed(raw, true);
    const { clean, learned, read } = harvest(raw, result.via === "cloud" ? (result.sources[0]?.url || "Claude") : "offline chat");
    Object.assign(bot, {
      text: clean || "…I'm speechless. Mark the date.",
      via: result.via, sources: result.sources, searches: result.searches,
      thoughts: result.thoughts, deep: result.deep, read,
      learned: [...bot.learned, ...learned],
    });
  } catch (e) {
    if (e.name === "AbortError") {
      // You interrupted. Keep whatever VEX managed to say.
      const { clean, read } = harvest(lastLive.replace(/<<[^>]*$/, ""), "conversation");
      Object.assign(bot, { text: (clean ? clean + " —" : "—") + " *(interrupted)*", via: brain, read });
    } else {
      console.error(e);
      Object.assign(bot, { text: e.message || String(e), error: true, via: "" });
    }
  }
  currentAbort = null;
  fillBot(el, bot);
  if (!bot.error) {
    bot.at = Date.now(); chat.push(bot); saveChat();
    // Every 6 exchanges, VEX quietly reflects on how you think.
    sinceReflect++; store.set("sinceReflect", sinceReflect);
    if (sinceReflect >= 6) {
      sinceReflect = 0; store.set("sinceReflect", 0);
      reflect().then((more) => {
        if (!more.length) return;
        bot.learned.push(...more); saveChat(); fillBot(el, bot);
      });
    }
  } else {
    chat.pop(); saveChat(); // drop the unanswered message from history so it can be retried
    el.previousElementSibling?.classList.add("failed");
    if (voice) enqueueSpeech("Something went wrong. " + bot.text.slice(0, 120));
  }

  busy = false;
  $("#sendBtn").disabled = false;
  document.body.classList.remove("thinking");
  updateModeUI();
  scrollDown();
}

// ---------- UI wiring ----------
const input = $("#input");
const autoGrow = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; };
input.addEventListener("input", autoGrow);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("#composer").requestSubmit(); }
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = input.value;
  input.value = ""; autoGrow();
  send(t);
});
document.querySelectorAll(".starter").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.mode) setThinkMode(b.dataset.mode);
  send(b.textContent);
}));

// Toolbar: mode, thinking level, attachments, mic, and hands-free Talk.
function setThinkMode(v) { settings.thinkMode = v; $("#modeSel").value = v; saveSettings(); }
$("#modeSel").value = settings.thinkMode;
$("#modeSel").addEventListener("change", (e) => setThinkMode(e.target.value));
$("#thinkSel").value = THINK[settings.deepThink] ? settings.deepThink : "auto";
$("#thinkSel").addEventListener("change", (e) => { settings.deepThink = e.target.value; saveSettings(); });
$("#attachBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => { addFiles([...e.target.files]); e.target.value = ""; });
input.addEventListener("paste", (e) => {
  const imgs = [...(e.clipboardData?.files || [])];
  if (imgs.length) { e.preventDefault(); addFiles(imgs); }
});
document.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); document.body.classList.add("dropping"); } });
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
document.addEventListener("drop", (e) => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault(); document.body.classList.remove("dropping");
  addFiles([...e.dataTransfer.files]);
});
$("#micBtn").addEventListener("click", dictate);
$("#talkBtn").addEventListener("click", () => (call.on ? endCall() : startCall()));
$("#endCallBtn").addEventListener("click", endCall);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && call.on) endCall(); });

// Mode pill cycles Auto → Local → Claude
$("#modeBtn").addEventListener("click", () => {
  const order = ["auto", "local", "cloud"];
  settings.mode = order[(order.indexOf(settings.mode) + 1) % 3];
  saveSettings(); updateModeUI();
});

// Settings
const sel = $("#setLocalModel");
LOCAL_MODELS.forEach((m) => sel.add(new Option(m.label, m.id)));
async function refreshCacheState() {
  $("#cacheState").textContent = hasGPU() ? ((await checkCache()) ? "Downloaded ✓ works offline" : "Not downloaded yet") : "Not supported in this browser";
}
$("#settingsBtn").addEventListener("click", () => {
  $("#setName").value = settings.name;
  $("#setMode").value = settings.mode;
  $("#setKey").value = settings.apiKey;
  $("#setCloudModel").value = settings.cloudModel;
  $("#setSearch").checked = settings.webSearch;
  $("#setIntensity").value = settings.intensity;
  $("#setShowRead").checked = settings.showRead;
  $("#setUnfiltered").checked = settings.unfiltered;
  $("#setShowBS").checked = settings.showBS;
  $("#setCallModel").value = settings.callModel;
  $("#setVoiceOn").checked = settings.voiceOn;
  $("#setFishKey").value = settings.fishKey;
  $("#setFishVoice").value = settings.fishVoice;
  $("#setFishModel").value = settings.fishModel;
  $("#setFishProxy").value = settings.fishProxy;
  $("#setPcVoiceUrl").value = settings.pcVoiceUrl;
  $("#setPcVoiceId").value = settings.pcVoiceId;
  $("#setGithubToken").value = settings.githubToken;
  setSyncStatus(settings.githubToken ? (sync.error || (sync.last ? "Synced " + new Date(sync.last).toLocaleString() : "Not synced yet")) : "Off");
  $("#voiceState").textContent = "";
  sel.value = settings.localModel;
  refreshCacheState();
  $("#settings").showModal();
});
function readSettings() {
  settings.name = $("#setName").value.trim() || "Shawn";
  settings.mode = $("#setMode").value;
  settings.apiKey = $("#setKey").value.trim();
  settings.cloudModel = $("#setCloudModel").value;
  settings.webSearch = $("#setSearch").checked;
  settings.intensity = $("#setIntensity").value;
  const showChanged = settings.showRead !== $("#setShowRead").checked;
  settings.showRead = $("#setShowRead").checked;
  const bsChanged = settings.showBS !== $("#setShowBS").checked;
  settings.showBS = $("#setShowBS").checked;
  settings.unfiltered = $("#setUnfiltered").checked;
  settings.callModel = $("#setCallModel").value;
  settings.localModel = sel.value;
  settings.voiceOn = $("#setVoiceOn").checked;
  settings.fishKey = $("#setFishKey").value.trim();
  settings.fishVoice = $("#setFishVoice").value.trim();
  settings.fishModel = $("#setFishModel").value;
  settings.fishProxy = $("#setFishProxy").value.trim();
  settings.pcVoiceUrl = $("#setPcVoiceUrl").value.trim();
  settings.pcVoiceId = $("#setPcVoiceId").value.trim() || "vex";
  const tokenChanged = settings.githubToken !== $("#setGithubToken").value.trim();
  settings.githubToken = $("#setGithubToken").value.trim();
  // A newly connected device takes on the settings already saved in sync.
  if (tokenChanged) { sync.gistId = ""; store.set("gistId", ""); sync.settingsAt = 0; store.set("settingsAt", 0); }
  saveSettings(); updateModeUI(); updateVoiceUI();
  if (showChanged || bsChanged) render();
  if (tokenChanged && settings.githubToken) syncNow();
}
$("#settings").addEventListener("close", readSettings);
sel.addEventListener("change", () => { readSettings(); refreshCacheState(); });
$("#preloadBtn").addEventListener("click", async () => {
  readSettings();
  $("#cacheState").textContent = "Downloading…";
  try { await getEngine(); } catch (e) { alert(e.message); }
  refreshCacheState();
});
$("#testVoiceBtn").addEventListener("click", async () => {
  readSettings();
  $("#voiceState").textContent = "Speaking…";
  const r = await speak(`Hello, ${settings.name}. I've been looking forward to disagreeing with you.`, { force: true });
  $("#voiceState").textContent = r.via === "fish" ? (settings.fishKey && navigator.onLine ? "Fish Audio voice working ✓" : "PC voice working ✓") : r.error ? "Fish failed, used built-in voice" : "Built-in voice (add a Fish key for your custom voice)";
});
$("#voiceBtn").addEventListener("click", () => {
  settings.voiceOn = !settings.voiceOn;
  if (!settings.voiceOn) stopVoice();
  saveSettings(); updateVoiceUI();
});
$("#syncNowBtn").addEventListener("click", () => { readSettings(); syncNow(); });
$("#clearChatBtn").addEventListener("click", () => {
  if (!confirm("Clear the conversation? (VEX keeps its memories.)")) return;
  sync.clearedAt = Date.now(); store.set("clearedAt", sync.clearedAt);
  chat = []; saveChat(); render(); $("#settings").close();
});

// Memory
let memKind = "me";
function renderMemory() {
  const list = $("#memList");
  list.innerHTML = "";
  const items = memory.filter((m) => m.kind === memKind).slice().reverse();
  if (!items.length) {
    const empty = {
      me: "Nothing yet. Talk to VEX and it'll start figuring you out.",
      pattern: "Nothing yet. After a few conversations VEX will start noticing how you reason.",
      world: "Nothing yet. Turn on web search and ask about something current.",
    };
    list.innerHTML = `<li class="empty">${empty[memKind]}</li>`;
    return;
  }
  for (const m of items) {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button type="button" title="Forget this" aria-label="Forget">×</button>`;
    li.querySelector("span").textContent = m.text;
    const sm = document.createElement("small");
    sm.textContent = new Date(m.at).toLocaleDateString() + (m.source ? " · " + m.source : "");
    li.querySelector("span").appendChild(sm);
    li.querySelector("button").onclick = () => { sync.tomb[m.id] = Date.now(); store.set("tomb", sync.tomb); memory = memory.filter((x) => x.id !== m.id); saveMemory(); renderMemory(); };
    list.appendChild(li);
  }
}
$("#memBtn").addEventListener("click", () => { renderMemory(); $("#memory").showModal(); });
document.querySelectorAll(".memtab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".memtab").forEach((x) => x.classList.toggle("on", x === t));
  memKind = t.dataset.kind; renderMemory();
}));
$("#memAdd").addEventListener("click", () => {
  const v = $("#memNew").value.trim();
  if (v && learn(memKind, v, "you added")) { $("#memNew").value = ""; renderMemory(); }
});
$("#memNew").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("#memAdd").click(); } });

// Backup / restore (API key is never included)
$("#memExport").addEventListener("click", () => {
  const { apiKey, fishKey, githubToken, ...safeSettings } = settings;
  const blob = new Blob([JSON.stringify({ app: "vex", version: 1, exported: new Date().toISOString(), settings: safeSettings, memory, chat }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vex-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#memImport").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (data.app !== "vex") throw new Error("That isn't a VEX backup file.");
    const known = new Set(memory.map((m) => m.kind + "|" + m.text.toLowerCase()));
    for (const m of data.memory || []) if (!known.has(m.kind + "|" + m.text.toLowerCase())) memory.push(m);
    if (Array.isArray(data.chat) && (!chat.length || confirm("Replace the current conversation with the one in the backup?"))) chat = data.chat;
    if (data.settings) Object.assign(settings, data.settings, { apiKey: settings.apiKey, fishKey: settings.fishKey, githubToken: settings.githubToken });
    saveMemory(); saveChat(); saveSettings(); render(); renderMemory(); updateModeUI();
    alert("Restored. VEX remembers everything again.");
  } catch (err) { alert("Couldn't restore: " + err.message); }
  e.target.value = "";
});

window.addEventListener("online", () => { updateModeUI(); syncNow(); });
setInterval(() => { if (document.visibilityState === "visible") syncNow(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
window.addEventListener("offline", updateModeUI);

// Seed the one thing VEX should always know.
if (!memory.some((m) => m.kind === "me" && /name is/i.test(m.text))) learn("me", `Their name is ${settings.name}.`, "setup");

render();
updateModeUI();
updateVoiceUI();
if ("speechSynthesis" in window) speechSynthesis.getVoices(); // warm up the voice list

// Offline support for the app itself
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
}

// Pull anything new from your other devices on startup.
lastPublic = publicSettings();
syncNow();
