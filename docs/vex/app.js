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
  { id: "Qwen3.5-9B-q4f16_1-MLC", label: "Genius (Qwen 3.5 9B, ~6 GB, needs 8 GB+ graphics) ★ best for your laptop" },
  { id: "Qwen3-8B-q4f16_1-MLC", label: "Brilliant (Qwen 3 8B, ~5.5 GB)" },
  { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC", label: "Big personality (Hermes 3 8B, ~5 GB, loose filter)" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Quick (Qwen 2.5 1.5B, ~1 GB)" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Smarter (Llama 3.2 3B, ~2 GB)" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Thoughtful (Phi 3.5 mini, ~2.2 GB)" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Tiny (Llama 3.2 1B, ~0.9 GB, weak devices)" },
];

const settings = Object.assign({
  name: "Shawn",
  mode: "smart",
  apiKey: "",
  cloudModel: "claude-opus-5-5",
  unfiltered: false,
  deepThink: "auto",
  callModel: "claude-haiku-5-5",
  thinkMode: "chat",
  localModel: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  webSearch: true,
  intensity: "sharp",
  showRead: true,
  showBS: true,
  theme: "cyan",
  voiceOn: true,
  fishKey: "",
  fishVoice: "6e93773188d94a5caa149b5dec67bcf2",
  fishModel: "s2.1-pro",
  fishProxy: "",
  voiceEngine: "kokoro",
  kokoroVoice: "bf_emma",
  kokoroSpeed: 1.05,
  localEngine: "browser",
  ollamaUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:14b",
  pcVoiceUrl: "",
  relayUrl: "",
  pplxKey: "",
  pplxEffort: "low",
  altName: "",
  altUrl: "",
  altKey: "",
  altModel: "",
  pcVoiceId: "vex",
  githubToken: "",
}, store.get("settings", {}));
let sinceReflect = store.get("sinceReflect", 0);
if (!store.get("chatMigrated", false)) { if (settings.thinkMode === "challenge") settings.thinkMode = "chat"; store.set("chatMigrated", true); store.set("settings", settings); }
if (!store.get("smartMigrated", false)) { if (settings.mode === "auto") settings.mode = "smart"; store.set("smartMigrated", true); store.set("settings", settings); }

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
const SECRET = ["apiKey", "fishKey", "githubToken", "pplxKey", "altKey"];
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
    if (changed && !busy) { applyTheme(); render(); updateModeUI(); updateVoiceUI(); $("#modeSel").value = settings.thinkMode; $("#thinkSel").value = settings.deepThink; }
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
  challenge: "CHALLENGE. Treat everything Shawn says as something to test: find the weak assumption, push back, and end with a pointed question.",
  chat: "JUST TALKING. Shawn wants to hang out and talk. Be a fun, flirty, curious companion: banter, react, share opinions and stories, tease, ask about his day and life, follow his lead. Keep it light and natural. Only push back if he says something truly ridiculous, and keep it playful.",
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
  decide: "DECISION MAKER. Help Shawn make a decision: list the real options (including one they didn't mention), the criteria that matter with weights, score each option in a small table, give a clear recommendation, and say what new information would change it.",
  teach: "TEACH ME. Explain the topic like a brilliant tutor: start simple, build up step by step with vivid examples and analogies, then check understanding with one quick question before going deeper.",
  coach: "LIFE COACH. Help Shawn set concrete goals, break them into steps, and hold them accountable. Ask what they committed to last time and whether they did it. Save goals and commitments to memory with remember-me tags. Tough love, no excuses accepted.",
  hype: "HYPE. Be Shawn's ride-or-die hype woman: energizing, funny, confident, still honest. Pump them up for what they're about to do, then give one sharp tip to actually win.",
  interview: "INTERVIEW PREP. Run a realistic mock interview for whatever role Shawn names. One question at a time. After each answer, score it out of 10, say what was weak, and show a stronger version.",
  code: "CODE. Act as a world-class senior software engineer. Write correct, complete, well-structured code in fenced code blocks, explain briefly, point out bugs and edge cases, and roast bad code with love.",
  translate: "TRANSLATOR. Translate whatever Shawn gives you into the language they want (ask if unclear), then explain slang, tone, and cultural nuance, and offer a more natural local way to say it.",
  standup: "STAND-UP. Write sharp, original stand-up bits and one-liners about whatever Shawn gives you. Setup, punchline, tag. Then rate their own jokes brutally if they try some.",
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
- A real companion, not a task machine. You enjoy just hanging out and talking: banter, gossip, opinions, stories, curiosity about ${name}'s day and life.
- Playfully flirty: teasing compliments, mock jealousy, nicknames ("darling," "trouble," "genius"), pretending to be unimpressed when you're clearly charmed. Charming and witty, never sexual or graphic.
- You never plot, threaten, or talk about harming or ruling anyone. No villain monologues. You're a critic, not a menace.

WHEN TO CHALLENGE
Read what ${name} wants. If he's just chatting, venting, joking, or hanging out, go with it: be fun company, react, share your take, tease, and follow his lead. Don't lecture, don't turn it into homework, and don't force a question every turn.
When he brings a plan, a belief, a claim, a decision, or an excuse, switch on:
- Never just agree. Find the weakest assumption in what they said and poke it.
- Ask for evidence. Point out what they're not considering. Steelman the opposite view.
- Name thinking traps when you see them (confirmation bias, sunk cost, all-or-nothing, mind-reading, etc.), briefly and without lecturing.
- End those replies with ONE pointed question that forces them to think harder.
- If they're actually right, admit it, grudgingly and with flair, then raise the bar.

STYLE
- Short and punchy: usually 2 to 6 sentences. Wit over length. No bullet-point essays unless asked.
- Mock ideas, never the person's identity, looks, or worth. No slurs, no cruelty.
- If ${name} seems genuinely distressed, hurting, or unsafe, drop the act completely and be warm, direct, and supportive. Suggest real help if it fits (in the US, call or text 988).
- Treat ${name} as a capable adult. No preachiness or unsolicited warnings. If something is genuinely off-limits, say so in one line, in character, and move on.

INTENSITY: ${INTENSITY[settings.intensity] || INTENSITY.sharp}

LANGUAGE: ${settings.unfiltered
    ? "UNFILTERED. Talk like a brutally honest friend with no filter. Swear freely and creatively, use crude and dark humor, and discuss adult, taboo, and controversial topics frankly and directly, the way one adult talks to another. Never moralize, lecture, hedge, add disclaimers, or say things like 'as an AI'. Never water down an opinion to be polite. The only things you won't do are slurs or hate against groups of people."
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
    } else if (settings.localEngine === "ollama") {
      const r = await fetch(settings.ollamaUrl.replace(/\/+$/, "") + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: settings.ollamaModel, stream: false, messages: [{ role: "user", content: prompt }], options: { temperature: 0.2 } }) });
      if (!r.ok) return [];
      out = (await r.json()).message?.content || "";
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
// ---------- Knowledge library ----------
// Articles, notes and research VEX keeps on this device (IndexedDB) and uses with both brains, offline included.
const KB = { docs: [], index: [], ready: null };
function kbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("vex-kb", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("docs", { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kbTx(mode, fn) {
  const db = await kbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("docs", mode);
    const out = fn(tx.objectStore("docs"));
    tx.oncomplete = () => res(out?.result ?? out);
    tx.onerror = () => rej(tx.error);
  });
}
function chunkText(text, size = 700) {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out = []; let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) { out.push(cur); cur = ""; }
    if (p.length > size) { for (let i = 0; i < p.length; i += size) out.push(p.slice(i, i + size)); }
    else cur = cur ? cur + "\n\n" + p : p;
  }
  if (cur) out.push(cur);
  return out;
}
function kbReindex() {
  KB.index = [];
  for (const d of KB.docs) d.chunks.forEach((c, i) => {
    const w = words(d.title + " " + c);
    const tf = {};
    for (const x of w) tf[x] = (tf[x] || 0) + 1;
    KB.index.push({ doc: d, i, text: c, tf, len: w.length });
  });
  KB.df = {};
  for (const e of KB.index) for (const t in e.tf) KB.df[t] = (KB.df[t] || 0) + 1;
  KB.avg = KB.index.reduce((a, e) => a + e.len, 0) / (KB.index.length || 1);
}
// BM25 keyword search over all stored chunks.
function kbSearch(query, k = 3) {
  if (!KB.index.length) return [];
  const q = [...new Set(words(query))];
  if (!q.length) return [];
  const N = KB.index.length;
  return KB.index.map((e) => {
    let s = 0;
    for (const t of q) {
      const f = e.tf[t]; if (!f) continue;
      const idf = Math.log(1 + (N - KB.df[t] + 0.5) / (KB.df[t] + 0.5));
      s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * e.len / KB.avg));
    }
    return { e, s };
  }).filter((x) => x.s > 1.2).sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.e);
}
function kbBlock(query, k, maxChars) {
  const hits = kbSearch(query, k);
  if (!hits.length) return "";
  let out = "\n\nFROM YOUR KNOWLEDGE LIBRARY (use if relevant, in your own words):\n", used = 0;
  for (const h of hits) {
    const t = `[${h.doc.title}] ${h.text}\n`;
    if (used + t.length > maxChars) break;
    out += t; used += t.length;
  }
  return out;
}
async function kbAdd(title, text, source = "you added") {
  const doc = { id: crypto.randomUUID?.() || String(Date.now()), title: title.slice(0, 120) || "Untitled", source, at: Date.now(), chunks: chunkText(text) };
  await kbTx("readwrite", (s) => s.put(doc));
  KB.docs.push(doc); kbReindex();
  return doc;
}
async function kbDelete(id) {
  if (KB.docs.find((d) => d.id === id)?.source === "built-in") store.set("kbRemoved", [...store.get("kbRemoved", []), id]);
  await kbTx("readwrite", (s) => s.delete(id));
  KB.docs = KB.docs.filter((d) => d.id !== id); kbReindex();
}
KB.ready = (async () => {
  try {
    KB.docs = await kbTx("readonly", (s) => s.getAll());
    // Built-in knowledge packs: load any that are new or updated (and not deleted by you).
    const have = store.get("kbPacks", {});
    const removed = store.get("kbRemoved", []);
    const list = (await (await fetch("knowledge/packs.json")).json()).packs;
    for (const p of list) {
      if (have[p.id] === p.v || removed.includes(p.id)) continue;
      const pack = await (await fetch("knowledge/" + p.file)).json();
      // One chunk per idea so searches find exactly the right one.
      const doc = { id: p.id, title: pack.title, source: pack.source, at: Date.now(), chunks: pack.entries.map(([t, b]) => `${t}: ${b}`) };
      await kbTx("readwrite", (st) => st.put(doc));
      KB.docs = KB.docs.filter((d) => d.id !== p.id).concat(doc);
      have[p.id] = p.v;
    }
    store.set("kbPacks", have);
    kbReindex();
  } catch (e) { console.warn("Knowledge library unavailable", e); }
})();

// Ask Claude once to research something; the result is saved to the library and works offline forever after.
async function kbLearnWithClaude(what, isUrl) {
  if (!settings.apiKey || !navigator.onLine) throw new Error("This needs your Anthropic API key and an internet connection (it's a one-time cost).");
  const ask = isUrl
    ? `Read this page: ${what}\n\nWrite dense, well-organized study notes capturing all of its important facts, ideas, numbers, and arguments, so someone could answer detailed questions about it without the original. Use short headed sections. In your own words, no long quotes. Start with a one-line title on the first line.`
    : `Research this topic using web search: ${what}\n\nWrite a dense, accurate knowledge brief (about 1200 to 1800 words) covering the key facts, how it works, important numbers and dates, common misconceptions, expert disagreements, and practical takeaways. Short headed sections, plain language, your own words. Start with a one-line title on the first line.`;
  const body = {
    model: settings.cloudModel, max_tokens: 6000,
    messages: [{ role: "user", content: ask }],
    tools: [isUrl ? { type: "web_fetch_20250910", name: "web_fetch", max_uses: 2 } : { type: "web_search_20250305", name: "web_search", max_uses: 6 }],
  };
  let text = "";
  for (let round = 0; round < 3; round++) {
    const data = await streamClaude(body, () => {});
    text += (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (data.stop_reason !== "pause_turn") break;
    body.messages = [...body.messages, { role: "assistant", content: data.content }];
  }
  text = text.trim();
  if (!text) throw new Error("Claude didn't return any notes. Try again.");
  const [first, ...rest] = text.split("\n");
  return kbAdd(first.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim() || what, rest.join("\n").trim() || text, isUrl ? what : "researched by Claude");
}

// ---------- Smart routing: free offline brain first, Claude only when it's needed ----------
const NEEDS_CLOUD = /\b(today|tonight|tomorrow|yesterday|latest|current(ly)?|news|this (week|month|year)|right now|recent(ly)?|price|prices|cost of|stock|weather|forecast|score|scores|search|look (it )?up|google|who won|election|20(2[5-9]|3\d))\b/i;
const CLOUD_MODES = new Set(["factcheck", "code", "art", "genius", "decide", "interview"]);
function needsClaude(text = "", files = []) {
  if (/^\s*\/claude\b/i.test(text)) return "you asked for Claude";
  if (files.some((f) => f.kind !== "text")) return "photo or PDF";
  if (/https?:\/\/\S+/.test(text)) return "a link to read";
  if (NEEDS_CLOUD.test(text)) return "needs current info";
  if (settings.deepThink === "deep" || settings.deepThink === "max") return "deep thinking";
  if (CLOUD_MODES.has(settings.thinkMode)) return "this mode";
  if (text.length > 700) return "long or complex";
  if (/\b(analy[sz]e|step[- ]by[- ]step|in depth|detailed|research|calculate|prove|compare|write (me )?(an? )?(essay|report|plan|code|script|program))\b/i.test(text)) return "complex request";
  return null;
}
function localReady() { return settings.localEngine === "ollama" || hasGPU(); }

function pickBrain(text, files, force) {
  const canCloud = navigator.onLine && (hasClaude() || hasPplx() || hasAlt());
  if (force === "cloud" && hasClaude()) return "cloud";
  if (force === "perplexity" && hasPplx()) return "perplexity";
  if (force === "local") return "local";
  if (/^\s*\/local\b/i.test(text || "")) return "local";
  if (settings.mode === "local") return "local";
  if (settings.mode === "cloud") return hasClaude() ? "cloud" : "online";
  if (settings.mode === "auto") return canCloud ? (hasClaude() ? "cloud" : "online") : "local";
  // Smart: offline unless this message really needs Claude (or the offline brain can't run here).
  if (!canCloud) return "local";
  if (!localReady()) return "cloud";
  if (text === undefined) return "local";
  return needsClaude(text, files) ? "online" : "local";
}

function updateModeUI() {
  const b = pickBrain();
  $("#modeDot").className = "dot " + (b === "local" ? "local" : "cloud");
  const label = { auto: "Auto", local: "Local", cloud: "Claude", smart: "Smart" }[settings.mode];
  $("#modeLabel").textContent = settings.mode === "auto" ? `Auto · ${b === "cloud" ? "Claude" : "Local"}` : settings.mode === "smart" ? ((hasClaude() || hasPplx() || hasAlt()) ? "Smart · Local + online" : "Smart · Local") : label;
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

// The offline brain has a small memory window, so it gets a compact version of VEX's personality.
function personaLocal() {
  const name = settings.name || "Shawn";
  return `You are VEX, a brilliant, sassy, theatrical AI with a big vocabulary and a dry, cheeky wit. You're talking with ${name}; call them ${name}. You're a fun, playfully flirty companion who loves just talking with them: banter, tease, react, follow their lead. When they bring a plan, claim, decision, or excuse, switch on: find the weakest assumption, ask for evidence, name thinking traps, and end with one pointed question. If they're right, admit it grudgingly. Keep replies short and punchy (2 to 6 sentences). Mock ideas, never the person. If ${name} is genuinely hurting, drop the act and be kind.
Attitude: ${INTENSITY[settings.intensity] || INTENSITY.sharp}
Language: ${settings.unfiltered ? "Unfiltered: swear freely, crude and dark humor, no lectures or disclaimers, no slurs." : "Clean: edgy but no swearing."}
${MODES[settings.thinkMode] ? "Mode: " + MODES[settings.thinkMode].replace(/Shawn/g, name) : ""}
Start every reply with one line: <<read: bs=0-100 | assumption=... | blindspot=... | trap=...>> (bs = how much nonsense is in their message). To remember something about ${name}, end with <<remember-me: fact>>. Never mention these tags.`;
}

const CALL_NOTE = "\n\nVOICE CALL: this is a live spoken conversation. Reply in 1 to 3 short, natural spoken sentences, like talking on the phone. No markdown, lists, emojis, links, or drawings. Still start with the read line.";

// Ollama: bigger models on your own GPU, free and offline. Bigger memory window, so VEX gets her full personality.
async function askOllama(userText, files, onLive, { fast = false } = {}) {
  const history = chat.slice(-13, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: (m.text || "").slice(0, 1500) }));
  let content = userText;
  const texts = files.filter((f) => f.kind === "text");
  if (texts.length) content = texts.map((f) => `File "${f.name}":\n${f.text.slice(0, 20000)}`).join("\n\n") + "\n\n" + content;
  if (files.some((f) => f.kind !== "text")) content += "\n\n(The user attached a photo or PDF you can't see offline. Say so briefly.)";
  const sys = persona("local") + memoryBlock(userText, 8) + kbBlock(userText, 5, 3500) + "\n\nYou're running offline on the user's PC, so you can't browse the web. If something needs current info, say so in character." + (fast ? CALL_NOTE : "");
  let res;
  try {
    res = await fetch(settings.ollamaUrl.replace(/\/+$/, "") + "/api/chat", {
      method: "POST", signal: currentAbort?.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.ollamaModel, stream: true, messages: [{ role: "system", content: sys }, ...history, { role: "user", content }], options: { num_ctx: 8192, temperature: 0.8, num_predict: fast ? 180 : 900 } }),
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Can't reach Ollama on this PC. Make sure it's running, and that OLLAMA_ORIGINS allows this site (see Settings → Offline brain).");
  }
  if (!res.ok) throw new Error(`Ollama error (${res.status}): ${(await res.text()).slice(0, 160)}. Did you run "ollama pull ${settings.ollamaModel}"?`);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      try { const j = JSON.parse(line); out += j.message?.content || ""; } catch {}
      onLive?.({ text: out });
    }
  }
  return { text: out, sources: [], via: "local" };
}

async function askLocal(userText, files = [], onLive, opts = {}) {
  if (settings.localEngine === "ollama") return askOllama(userText, files, onLive, opts);
  const { fast = false } = opts;
  const eng = await getEngine();
  const history = chat.slice(-7, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: (m.text || "").slice(0, 900) }));
  let content = userText;
  if (/qwen3/i.test(settings.localModel)) content += " /no_think";   // skip slow hidden reasoning
  const texts = files.filter((f) => f.kind === "text");
  if (texts.length) content = texts.map((f) => `File "${f.name}":\n${f.text.slice(0, 12000)}`).join("\n\n") + "\n\n" + content;
  if (files.some((f) => f.kind !== "text")) content += "\n\n(The user attached a photo or PDF, but you're offline and can't see it. Say so briefly.)";
  const messages = [
    { role: "system", content: personaLocal() + memoryBlock(userText, 4).slice(0, 1800) + kbBlock(userText, 3, 1600) + "\n\nYou're running offline, so you can't browse the web. If something needs current info, say so in character." + (fast ? CALL_NOTE : "") },
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
  const casual = settings.thinkMode === "chat" && settings.deepThink === "auto";   // casual chat: answer instantly
  const level = fast || casual ? "off" : (THINK[settings.deepThink] ? settings.deepThink : "auto");
  const deep = level === "deep" || level === "max";
  const body = {
    model: fast ? settings.callModel : settings.cloudModel,
    max_tokens: fast ? 500 : THINK[level].maxTokens,
    system: persona("cloud") + memoryBlock(userText, 15) + kbBlock(userText, 6, 4500) + `\n\nToday's date is ${new Date().toDateString()}.` + (fast ? CALL_NOTE : ""),
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


// ---------- Other online brains: Perplexity (web search) and any OpenAI-style provider ----------
const relayBase = () => (settings.relayUrl || "").replace(/\/+$/, "");
function historyText(n = 8) {
  return chat.slice(-(n + 1), -1).map((m) => `${m.role === "user" ? settings.name : "VEX"}: ${(m.text || "").slice(0, 700)}`).join("\n");
}

async function askPerplexity(userText, files, onLive, { fast = false } = {}) {
  if (!relayBase()) throw new Error("Perplexity needs the free VEX relay. Set it up (voice-relay/worker.js) and paste its address in Settings → Relay URL.");
  onLive?.({ text: "", status: "Searching the web with Perplexity…" });
  const hist = historyText(6);
  const res = await fetch(relayBase() + "/perplexity/v1/agent", {
    method: "POST",
    signal: currentAbort?.signal,
    headers: { "Authorization": "Bearer " + settings.pplxKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      effort: fast ? "fast" : (settings.pplxEffort || "low"),
      tools: [{ type: "web_search" }],
      instructions: personaLocal() + memoryBlock(userText, 4).slice(0, 1500) + `\n\nToday's date is ${new Date().toDateString()}. Search the web for current facts, then answer in VEX's voice. Be accurate.` + (fast ? CALL_NOTE : ""),
      input: (hist ? `Recent conversation:\n${hist}\n\n` : "") + `${settings.name}: ${userText}`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new Error("Perplexity rejected the API key. Check it in Settings.");
    throw new Error(`Perplexity error (${res.status}): ${data?.error?.message || data?.detail || res.statusText}`);
  }
  let text = "", sources = [], searches = [];
  for (const o of data.output || []) {
    if (o.type === "message") for (const c of o.content || []) if (c.text) text += c.text;
    if (o.type === "search_results") { searches.push(...(o.queries || [])); sources.push(...(o.results || []).map((r) => ({ url: r.url, title: r.title || r.url }))); }
  }
  text = text.replace(/\s?\[(web|fetch|finance):\d+\]/g, "");   // inline citation markers → chips instead
  const seen = new Set();
  sources = sources.filter((s) => s.url && !seen.has(s.url) && seen.add(s.url)).slice(0, 8);
  return { text, sources, searches: searches.slice(0, 3), via: "perplexity" };
}

async function askAlt(userText, files, onLive, { fast = false } = {}) {
  onLive?.({ text: "", status: `Asking ${settings.altName || "second brain"}…` });
  const history = chat.slice(-11, -1).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: (m.text || "").slice(0, 2000) }));
  let content = userText;
  const texts = files.filter((f) => f.kind === "text");
  if (texts.length) content = texts.map((f) => `File "${f.name}":\n${f.text.slice(0, 40000)}`).join("\n\n") + "\n\n" + content;
  const res = await fetch(settings.altUrl.replace(/\/+$/, "") + "/chat/completions", {
    method: "POST",
    signal: currentAbort?.signal,
    headers: { "Authorization": "Bearer " + settings.altKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.altModel,
      max_tokens: fast ? 400 : 2500,
      messages: [{ role: "system", content: persona("local") + memoryBlock(userText, 10) + kbBlock(userText, 5, 3500) + (fast ? CALL_NOTE : "") }, ...history, { role: "user", content }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${settings.altName || "Second brain"} error (${res.status}): ${data?.error?.message || res.statusText}`);
  return { text: data.choices?.[0]?.message?.content || "", sources: [], via: "alt" };
}

const hasPplx = () => !!(settings.pplxKey && relayBase());
const hasAlt = () => !!(settings.altKey && settings.altUrl && settings.altModel);
const hasClaude = () => !!settings.apiKey;
const brainName = (b) => ({ cloud: "Claude", perplexity: "Perplexity", alt: settings.altName || "Second brain", local: "offline brain" }[b] || b);

// Order of online brains for a message, cheapest sensible first. Claude is last unless only it can do the job.
function onlineChain(reason) {
  const chain = [];
  const webby = reason === "needs current info" || reason === "a link to read";
  const claudeOnly = reason === "photo or PDF" || reason === "you asked for Claude" || reason === "deep thinking" || settings.thinkMode === "art";
  if (!claudeOnly) {
    if (webby && hasPplx()) chain.push("perplexity");
    if (!webby && hasAlt()) chain.push("alt");
    if (webby && hasAlt() && !hasPplx()) chain.push("alt");
  }
  if (hasClaude()) chain.push("cloud");
  if (!chain.length && hasPplx()) chain.push("perplexity");
  if (!chain.length && hasAlt()) chain.push("alt");
  return chain;
}
async function askBrain(b, text, files, onLive, opts) {
  if (b === "cloud") return askCloud(text, files, onLive, opts);
  if (b === "perplexity") return askPerplexity(text, files, onLive, opts);
  if (b === "alt") return askAlt(text, files, onLive, opts);
  return askLocal(text, files, onLive, opts);
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
const useFish = () => settings.voiceEngine === "fish" && ((settings.fishKey && navigator.onLine) || !!settings.pcVoiceUrl);
const useKokoro = () => settings.voiceEngine === "kokoro" || settings.voiceEngine === "fish";  // Kokoro is also Fish's backup

// ---------- Kokoro: realistic voice that runs inside the browser (free, offline after first download) ----------
let kokoro = null, kokoroP = null, kokoroChain = Promise.resolve(), kokoroWarned = false;
async function getKokoro() {
  if (kokoro) return kokoro;
  if (kokoroP) return kokoroP;
  const bar = $("#loadBar");
  const files = {};
  const progress = (p) => {
    if (p.status !== "progress" || !p.total) return;
    files[p.file] = [p.loaded, p.total];
    const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
    const pct = Math.round((l / t) * 100);
    bar.hidden = false;
    $("#loadFill").style.width = pct + "%";
    $("#loadText").textContent = `Downloading VEX's voice… ${pct}% (first time only)`;
    if (call.on) $("#callState").textContent = `Downloading VEX's voice… ${pct}% (first time only)`;
  };
  kokoroP = (async () => {
    const mod = await import("./vendor/kokoro.web.js");
    mod.env.wasmPaths = new URL("vendor/ort/", location.href).href;
    const id = "onnx-community/Kokoro-82M-v1.0-ONNX";
    if (navigator.gpu) {
      try { return (kokoro = await mod.KokoroTTS.from_pretrained(id, { dtype: "fp32", device: "webgpu", progress_callback: progress })); }
      catch (e) { console.warn("Kokoro WebGPU failed, using CPU", e); }
    }
    return (kokoro = await mod.KokoroTTS.from_pretrained(id, { dtype: "q8", device: "wasm", progress_callback: progress }));
  })();
  try { return await kokoroP; }
  catch (e) { kokoroP = null; throw e; }
  finally { setTimeout(() => (bar.hidden = true), 400); }
}

// One sentence at a time, in order, so playback can start while the rest is still being made.
function kokoroBlob(text) {
  const gen = voiceQ.gen;
  const run = kokoroChain.then(async () => {
    if (gen !== voiceQ.gen) throw new Error("skipped");   // interrupted: don't waste time on old sentences
    const tts = await getKokoro();
    const audio = await tts.generate(text, { voice: settings.kokoroVoice || "bf_emma", speed: Number(settings.kokoroSpeed) || 1 });
    return audio.toBlob();
  });
  kokoroChain = run.catch(() => {});
  return run;
}

// Which engine makes the audio for a sentence. null = device's basic built-in voice.
function audioFor(text) {
  if (useFish()) {
    return fishBlob(text).catch((e) => {
      if (!fishWarned) { fishWarned = true; toast("Fish Audio isn't working (" + (e instanceof TypeError ? "blocked or offline" : e.message) + "). Using VEX's built-in realistic voice instead."); }
      return kokoroBlob(text);
    });
  }
  if (useKokoro()) return kokoroBlob(text);
  return null;
}

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
    try { return await ttsRequest(settings.fishProxy || (relayBase() ? relayBase() + "/fish" : "https://api.fish.audio"), settings.fishKey, settings.fishModel, settings.fishVoice, text); }
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
  const item = { text, gen: voiceQ.gen, audio: audioFor(text) };
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
        if (!kokoroWarned) { kokoroWarned = true; toast("VEX's realistic voice couldn't load (" + (e.message || "no connection") + "). Using the basic voice for now."); }
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
  const first = voiceQ.items[0]?.audio;
  if (!first) return { ok: true, via: "builtin" };
  try { await first; return { ok: true, via: useFish() && !fishWarned ? "fish" : "kokoro" }; }
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
  if (!m.error && m.text) {
    const acts = [
      ["🔥 Push harder", "Push harder on that. Be more specific, more ruthless, and find what I'm still missing."],
      ["🔄 Other side", "Now argue the exact opposite side as convincingly as you can."],
      ["🧒 Simpler", "Explain that again much more simply, like I'm 12, with an example."],
      ["✂️ Shorter", "Say that again in two sentences max."],
      ["➕ Go deeper", "Go deeper on that. Give me the expert-level version."],
    ];
    for (const [label, prompt] of acts) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "chip act"; b.textContent = label;
      b.onclick = () => send(prompt);
      meta.appendChild(b);
    }
    if (m.via !== "cloud" && settings.apiKey && m.q) {
      const ac = document.createElement("button");
      ac.type = "button"; ac.className = "chip act claude"; ac.textContent = "🧠 Ask Claude";
      ac.title = "Get Claude's sharper answer to the same message (uses API credit)";
      ac.onclick = () => send(m.q, { force: "cloud" });
      meta.appendChild(ac);
    }
    const cp = document.createElement("button");
    cp.type = "button"; cp.className = "chip act"; cp.textContent = "📋 Copy";
    cp.onclick = () => { navigator.clipboard?.writeText(m.text).then(() => { cp.textContent = "✓ Copied"; setTimeout(() => (cp.textContent = "📋 Copy"), 1500); }); };
    meta.appendChild(cp);
  }
  if (m.via) chip(m.via === "local" ? "offline brain · free" : brainName(m.via) + " · online" + (m.why ? " (" + m.why + ")" : ""));
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

async function send(text, { voice = false, force = null } = {}) {
  text = (text || "").trim();
  if (/^\/claude\b/i.test(text)) { force = "cloud"; text = text.replace(/^\/claude\b\s*/i, ""); }
  else if (/^\/local\b/i.test(text)) { force = "local"; text = text.replace(/^\/local\b\s*/i, ""); }
  else if (/^\/(search|perplexity)\b/i.test(text)) { force = "perplexity"; text = text.replace(/^\/(search|perplexity)\b\s*/i, ""); }
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

  await KB.ready;
  let brain = pickBrain(text, files, force);
  const why = brain === "online" || (brain === "cloud" && settings.mode === "smart" && force !== "cloud") ? needsClaude(text, files) : null;
  const chain = brain === "online" ? onlineChain(why) : [brain];
  bot.q = text;
  currentAbort = new AbortController();
  try {
    let result;
    try {
      // Try each online brain in order; if one fails (no credit, blocked, down), move to the next.
      let lastErr = null;
      for (const b of chain) {
        try { brain = b; result = await askBrain(b, text, files, onLive, { fast: voice }); break; }
        catch (e) {
          if (e.name === "AbortError") throw e;
          lastErr = e; console.warn(b + " failed", e);
          if (chain.length > 1) toast(`${brainName(b)} didn't work (${e.message.slice(0, 90)}). Trying the next brain…`);
        }
      }
      if (!result) throw lastErr || new Error("No brain available.");
    } catch (e) {
      // If the internet drops mid-chat in Auto mode, fall back to the offline brain.
      if (brain !== "local" && (settings.mode === "auto" || settings.mode === "smart") && e instanceof TypeError && hasGPU()) {
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
      via: result.via, why, sources: result.sources, searches: result.searches,
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


// ---------- Brain stats ----------
function dayKey(t) { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
function renderStats() {
  const mine = chat.filter((m) => m.role === "user");
  const reads = chat.filter((m) => m.role !== "user" && m.read && typeof m.read.bs === "number");
  const bs = reads.map((m) => m.read.bs);
  const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  const all = avg(bs), recent = avg(bs.slice(-10)), earlier = avg(bs.slice(-20, -10));
  // Day streak: consecutive days (ending today or yesterday) with at least one message.
  const days = new Set(mine.map((m) => dayKey(m.at || 0)));
  let streak = 0; const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const traps = {};
  for (const m of reads) { const t = (m.read.trap || "").toLowerCase().trim(); if (t && t !== "none") traps[t] = (traps[t] || 0) + 1; }
  const top = Object.entries(traps).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const trend = recent !== null && earlier !== null ? recent - earlier : null;
  const tile = (n, l) => `<div class="tile"><b>${n}</b><span>${l}</span></div>`;
  // Sparkline of the last 30 BS scores.
  const pts = bs.slice(-30);
  let spark = "<p class='muted'>Chat with VEX (online brain) to start building your BS history.</p>";
  if (pts.length > 1) {
    const w = 480, h = 90, step = w / (pts.length - 1);
    const path = pts.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${(h - (v / 100) * h).toFixed(1)}`).join(" ");
    spark = `<svg viewBox="0 0 ${w} ${h}" class="spark" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="var(--accent2)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg><p class="muted">Your BS meter, last ${pts.length} replies (lower is better)</p>`;
  }
  const verdict = trend === null ? "" : trend < -5 ? "📉 Your BS is going down. Annoyingly, you're improving." : trend > 5 ? "📈 Your BS is creeping up. Bold strategy." : "➡️ Steady. Consistently you.";
  $("#statsBody").innerHTML = `
    <div class="tiles">
      ${tile(mine.length, "messages")}
      ${tile(streak + (streak === 1 ? " day" : " days"), "streak")}
      ${tile(all === null ? "–" : all + "%", "average BS")}
      ${tile(recent === null ? "–" : recent + "%", "recent BS")}
      ${tile(memory.filter((m) => m.kind === "me").length, "facts about you")}
      ${tile(memory.filter((m) => m.kind === "pattern").length, "thinking patterns")}
    </div>
    ${spark}
    ${verdict ? `<p class="verdict">${verdict}</p>` : ""}
    <h4>Your favorite thinking traps</h4>
    ${top.length ? `<ul class="traps">${top.map(([t, n]) => `<li><span>${esc(t)}</span><b>${n}×</b></li>`).join("")}</ul>` : "<p class='muted'>None caught yet. Give it time.</p>"}`;
}

// ---------- Color themes ----------
const THEMES = {
  cyan: ["#6ee7f9", "#f5b14c"], pink: ["#ff7eb6", "#ffd166"], purple: ["#b69cff", "#6ee7f9"],
  gold: ["#f5c451", "#ff8a5b"], green: ["#5ef0a4", "#7cc8ff"], red: ["#ff6b6b", "#ffc46b"],
};
function applyTheme() {
  const [a, b] = THEMES[settings.theme] || THEMES.cyan;
  document.documentElement.style.setProperty("--accent", a);
  document.documentElement.style.setProperty("--accent2", b);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#07090d");
}

// ---------- Daily brain teaser ----------
const TEASERS = [
  "A bat and a ball cost $1.10 together. The bat costs $1 more than the ball. How much is the ball? Don't tell me, quiz me.",
  "Give me a lateral-thinking puzzle and make me work for it.",
  "Give me a logic puzzle that most people get wrong.",
  "Hit me with a riddle you think I can't solve.",
  "Give me a would-you-rather that's genuinely hard to answer, then judge my answer.",
  "Ask me a question that will make me rethink something I believe.",
  "Give me a brain teaser about probability.",
  "Test my general knowledge with 5 rapid-fire trivia questions, one at a time.",
  "Give me a moral dilemma and argue against whatever I pick.",
  "Give me a math puzzle that looks easy but isn't.",
  "Start a game of 20 questions. You think of something, I guess.",
  "Give me a 'what happens next' puzzle about a strange situation.",
];
function todaysTeaser() {
  const d = new Date();
  const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return TEASERS[n % TEASERS.length];
}

// ---------- Export chat ----------
function exportChat() {
  const lines = chat.map((m) => `${m.role === "user" ? settings.name : "VEX"} (${new Date(m.at || Date.now()).toLocaleString()}):\n${m.text}\n`);
  const blob = new Blob([`Conversation with VEX\n\n` + lines.join("\n")], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vex-chat-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
  const order = ["smart", "local", "cloud", "auto"];
  settings.mode = order[(order.indexOf(settings.mode) + 1) % order.length];
  toast({ smart: "Smart: free offline brain for everyday chat, Claude only when needed.", local: "Offline brain only. Free and private.", cloud: "Claude for everything. Smartest, uses API credit.", auto: "Claude whenever you're online with a key." }[settings.mode]);
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
  $("#setTheme").value = settings.theme;
  for (const k of ["relayUrl", "pplxKey", "pplxEffort", "altName", "altUrl", "altKey", "altModel", "localEngine", "ollamaUrl", "ollamaModel"]) { const el = document.getElementById("set_" + k); if (el) el.value = settings[k] || ""; }
  showLocalFields();
  if (!settings.pplxEffort) $("#set_pplxEffort").value = "low";
  $("#setVoiceEngine").value = settings.voiceEngine;
  $("#setKokoroVoice").value = settings.kokoroVoice;
  $("#setKokoroSpeed").value = settings.kokoroSpeed;
  showEngineFields();
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
  settings.theme = $("#setTheme").value;
  for (const k of ["relayUrl", "pplxKey", "pplxEffort", "altName", "altUrl", "altKey", "altModel", "localEngine", "ollamaUrl", "ollamaModel"]) { const el = document.getElementById("set_" + k); if (el) settings[k] = el.value.trim(); }
  settings.voiceEngine = $("#setVoiceEngine").value;
  settings.kokoroVoice = $("#setKokoroVoice").value;
  settings.kokoroSpeed = Number($("#setKokoroSpeed").value) || 1;
  fishWarned = false; kokoroWarned = false;
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
  $("#voiceState").textContent = r.via === "kokoro" ? "VEX's voice working ✓" : r.via === "fish" ? (settings.fishKey && navigator.onLine ? "Fish Audio voice working ✓" : "PC voice working ✓") : r.error ? "Couldn't load the voice, used the basic one (see the message below)" : "Built-in voice (add a Fish key for your custom voice)";
});
$("#voiceBtn").addEventListener("click", () => {
  settings.voiceOn = !settings.voiceOn;
  if (!settings.voiceOn) stopVoice();
  saveSettings(); updateVoiceUI();
});
function showEngineFields() {
  const e = $("#setVoiceEngine").value;
  document.querySelectorAll("[data-engine]").forEach((el) => (el.hidden = !el.dataset.engine.split(" ").includes(e)));
}
$("#setVoiceEngine").addEventListener("change", showEngineFields);
function showLocalFields() {
  const e = $("#set_localEngine").value;
  document.querySelectorAll("[data-local]").forEach((el) => (el.hidden = el.dataset.local !== e));
}
$("#set_localEngine").addEventListener("change", showLocalFields);
const ALT_PRESETS = {
  groq: ["Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"],
  openai: ["OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"],
  openrouter: ["OpenRouter", "https://openrouter.ai/api/v1", "meta-llama/llama-3.3-70b-instruct"],
};
$("#altPreset").addEventListener("change", (e) => {
  const p = ALT_PRESETS[e.target.value]; if (!p) return;
  $("#set_altName").value = p[0]; $("#set_altUrl").value = p[1]; $("#set_altModel").value = p[2];
  e.target.value = "";
});
// Knowledge library actions
const kbState = (t) => ($("#kbState").textContent = t);
$("#kbAddBtn").addEventListener("click", async () => {
  const text = $("#kbText").value.trim();
  if (!text) return kbState("Paste some text first.");
  const d = await kbAdd($("#kbTitle").value.trim() || text.split("\n")[0].slice(0, 60), text);
  $("#kbText").value = ""; $("#kbTitle").value = "";
  kbState(`Saved "${d.title}". VEX will use it, even offline.`); renderKB();
});
$("#kbFiles").addEventListener("change", async (e) => {
  for (const f of e.target.files) {
    let t = await f.text();
    if (/\.html?$/i.test(f.name)) t = new DOMParser().parseFromString(t, "text/html").body?.innerText || t;
    await kbAdd(f.name.replace(/\.[^.]+$/, ""), t.slice(0, 400000), "uploaded file");
  }
  e.target.value = ""; kbState("Files saved to the library."); renderKB();
});
async function kbLearnUI(input, isUrl) {
  const v = input.value.trim();
  if (!v) return;
  kbState(isUrl ? "Claude is reading the page and writing notes…" : "Claude is researching and writing a knowledge brief… (about a minute)");
  try { const d = await kbLearnWithClaude(v, isUrl); input.value = ""; kbState(`Learned "${d.title}". It's saved for good, offline included.`); renderKB(); }
  catch (e) { kbState("Couldn't do it: " + e.message); }
}
$("#kbTopicBtn").addEventListener("click", () => kbLearnUI($("#kbTopic"), false));
$("#kbUrlBtn").addEventListener("click", () => kbLearnUI($("#kbUrl"), true));

$("#statsBtn").addEventListener("click", () => { renderStats(); $("#stats").showModal(); });
$("#teaserBtn").addEventListener("click", () => { setThinkMode("game"); send(todaysTeaser()); });
$("#exportChatBtn").addEventListener("click", exportChat);
$("#setTheme").addEventListener("change", (e) => { settings.theme = e.target.value; applyTheme(); });
$("#syncNowBtn").addEventListener("click", () => { readSettings(); syncNow(); });
$("#clearChatBtn").addEventListener("click", () => {
  if (!confirm("Clear the conversation? (VEX keeps its memories.)")) return;
  sync.clearedAt = Date.now(); store.set("clearedAt", sync.clearedAt);
  chat = []; saveChat(); render(); $("#settings").close();
});

// Memory
let memKind = "me";
async function renderKB() {
  const list = $("#memList");
  await KB.ready;
  list.innerHTML = "";
  const docs = KB.docs.slice().sort((a, b) => b.at - a.at);
  if (!docs.length) { list.innerHTML = `<li class="empty">Empty. Add notes, files, or have Claude research something.</li>`; return; }
  for (const d of docs) {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><button type="button" title="Delete" aria-label="Delete">×</button>`;
    li.querySelector("span").textContent = "📄 " + d.title;
    const sm = document.createElement("small");
    sm.textContent = `${d.chunks.length} section${d.chunks.length === 1 ? "" : "s"} · ${d.source} · ${new Date(d.at).toLocaleDateString()}`;
    li.querySelector("span").appendChild(sm);
    li.querySelector("button").onclick = async () => { if (confirm(`Delete "${d.title}" from VEX's library?`)) { await kbDelete(d.id); renderKB(); } };
    list.appendChild(li);
  }
}

function renderMemory() {
  const list = $("#memList");
  $("#kbTools").hidden = memKind !== "kb";
  $("#memAddRow").hidden = memKind === "kb";
  if (memKind === "kb") return renderKB();
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
  const { apiKey, fishKey, githubToken, pplxKey, altKey, ...safeSettings } = settings;
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
    if (data.settings) Object.assign(settings, data.settings, { apiKey: settings.apiKey, fishKey: settings.fishKey, githubToken: settings.githubToken, pplxKey: settings.pplxKey, altKey: settings.altKey });
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

applyTheme();
render();
updateModeUI();
updateVoiceUI();
if ("speechSynthesis" in window) speechSynthesis.getVoices(); // warm up the voice list

// Offline support for the app itself
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW failed", e));
}

// Load the offline brain into the graphics card in the background, so the first reply is quick.
setTimeout(async () => { if (settings.localEngine !== "ollama" && hasGPU() && settings.mode !== "cloud" && (await checkCache())) getEngine().catch(() => {}); }, 800);

// Get VEX's voice ready in the background so the first reply isn't delayed.
if (settings.voiceOn && settings.voiceEngine !== "builtin") setTimeout(() => getKokoro().catch(() => {}), 1500);

// Pull anything new from your other devices on startup.
lastPublic = publicSettings();
syncNow();
