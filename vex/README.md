# VEX

A smug, theatrical AI whose whole job is to challenge how you think. It pokes holes in your plans, calls out thinking traps, and makes you defend your ideas, with plenty of attitude and none of the evil-robot stuff.

## What it does

- **Two brains**
  - **Offline brain:** a small AI model that runs entirely in your browser. It downloads once (about 1 to 2 GB), then works with no internet and nothing leaves your device. Needs a browser with WebGPU (recent Chrome or Edge on a computer).
  - **Online brain:** Claude, through your own Anthropic API key, with live web search.
  - **Auto mode** uses Claude when you're online with a key and switches to the offline brain otherwise, including if your connection drops mid-chat.
- **Learns you:** remembers facts about you, notices patterns in how you reason, and saves what it finds on the web. Both brains use the same memory.
- **Shows its thinking:** each reply can show "VEX's read": the assumption you're making, your blind spot, and the thinking trap involved.
- **Talks out loud:** use any Fish Audio voice model, run a cloned voice free on your own PC, or fall back to your device's built-in voice offline. See [`voice-relay/README.md`](voice-relay/README.md).
- **Hands-free voice calls:** tap Talk and just speak. VEX answers out loud, keeps listening, and stops talking the moment you interrupt. Calls use a fast model with short answers so replies come quickly.
- **Mic button** to dictate instead of typing.
- **Genius mode thinking:** Think levels Fast, Auto, Deep, and MAX, with a viewable reasoning panel. Reads photos, screenshots, PDFs, text files, and any link you paste.
- **BS meter:** every reply rates how much nonsense was in what you said.
- **Modes:** Challenge, Genius advisor, Debate, Socratic, Devil's advocate, Pre-mortem, Fact-check, plus fun ones: Roast, Games & riddles, Rap battle, Story, and Art (VEX draws pictures in the chat).
- **Attitude dial:** gentle, sharp, or ruthless, plus an optional unfiltered-language switch.
- **Saves everything** in your browser, with one-click backup and restore (Memory, then "Back up everything").
- **Installable:** add it to your home screen or desktop and it opens like an app, even offline.

## Setup

1. Open the site.
2. Tap the gear icon:
   - Your name (defaults to Shawn).
   - For the online brain, paste an API key from [console.anthropic.com](https://console.anthropic.com). Usage is billed to that API account (separate from a Claude.ai subscription), usually a few cents per conversation; Haiku is the cheapest.
   - For offline use, click "Download offline brain now" while you're online.

Your API key is stored only in your browser's local storage. It is never in the code or in this repo, and it is left out of backups. Don't commit it anywhere.

## Hosting

It's a plain static site: `index.html`, `style.css`, `app.js`, `sw.js`. On GitHub, go to **Settings → Pages**, pick **Deploy from a branch**, branch `main`, folder `/ (root)`, and save. The site appears at `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Credits

The offline brain uses [WebLLM](https://github.com/mlc-ai/web-llm) (Apache 2.0), bundled in `vendor/`.
