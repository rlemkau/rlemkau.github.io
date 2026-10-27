# VEX voice options

VEX can speak in three ways. Pick one in **Settings → Voice**.

## 1. Built-in voice (free, offline, zero setup)

Leave the Fish Audio key blank. VEX uses your device's own voice, pitched down. It isn't a custom voice, but it works anywhere, even offline.

## 2. Fish Audio online (custom voice, costs Fish credits)

Paste your Fish Audio API key and the voice model ID. If the **Test voice** button says Fish couldn't be reached, Fish is blocking direct browser calls. Deploy `worker.js` as a free Cloudflare Worker and paste its URL into **Voice server URL**.

## 3. Your own computer (custom voice, free, no credits)

Run the open-source version of Fish's engine, [Fish Speech](https://speech.fish.audio/), on your PC. It works like the paid service, so VEX can use it with just a URL change.

You'll need:
- A PC with an NVIDIA graphics card (roughly 8 GB of VRAM or more is comfortable), Python, and git.
- A clean 10 to 30 second audio clip of the voice you want, with no music behind it, plus a text transcript of what's said in it. Fish Speech clones the voice from that clip. You can't download a voice model off fish.audio, so the clip is what you need.

Steps:
1. Install Fish Speech and download its model by following the [official guide](https://speech.fish.audio/). Their docs cover Windows, Linux, and Docker.
2. Save your clip as a reference voice (the guide explains the `references` folder), and give it a name such as `vex`.
3. Start their API server (it listens on port 8080 by default).
4. In this folder, run `python local_relay.py`. That lets the browser talk to it.
5. In VEX → Settings → Voice:
   - Voice server URL: `http://localhost:8787`
   - Voice model ID: the reference name you chose (for example `vex`)
   - Fish Audio API key: type anything (for example `local`). The local server doesn't check it unless you start it with `--api-key`.
6. Press **Test voice**.

The voice only works while your PC and both programs are running. Use a voice clip you're allowed to use, and keep cloned voices of real people private.
