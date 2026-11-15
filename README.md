# Live Terrain Director

Direct a recognizable aerial landscape during a live Orbis stream. Trigger an event or type a direction, then open a clean audience viewer while the operator keeps the controls and prompt history. The live stage defaults to Orbis Dynamic at 1080p. If Dynamic is unavailable, select **Stable**, then **Start stream** to start a fresh stream from the same reference image.

## Run locally

Requires Node.js 22.12 or newer, pnpm, and your own [Reactor API key](https://reactor.inc/).

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `REACTOR_API_KEY` in `.env.local`, then run `pnpm dev` and open [the viewer](http://127.0.0.1:5173/). The starting frame is available before connecting to Reactor. Keep the key on the server in the local environment file.

1. Hover over the viewport to reveal the desktop controls. Select **Start stream** and wait for **Live**.
2. Select **Present** and share the video-only window. Keep the original tab for directions and **History**.
3. Try **Glacier retreat**, **Random event**, or a typed direction. Use **End stream** when done.

When you see the requested change, select **Mark change visible**. Hover over **History** to see the exact direction alongside the available before and marked frames. **Download run** saves the frames and timing. The `/setup` route contains the separate Three.js terrain study. The optional `/starter` examples use Gemini or OpenAI keys. The live stage only needs Reactor.

See the [presenter runbook](docs/demo.md) and [Orbis controls and limits](docs/orbis.md).

`pnpm dev` starts Vite with a session-cleanup wrapper. While in
development, sessions created by this starter are recorded in the gitignored
`.reactor-dev-sessions.json` file. It contains session IDs and metadata, but no
API keys or JWTs. The wrapper uses the server-only `REACTOR_API_KEY` to delete
recorded sessions before startup and again on `Ctrl+C`/`SIGTERM`, so restarting
the dev server cannot silently leave a previous Orbis session consuming
capacity. If a startup sweep cannot delete a recorded session, the wrapper
refuses to start another dev server and reports the session ID.

Run `pnpm typecheck` to check TypeScript while editing. To run the production build locally, run `pnpm build` followed by `pnpm start` and open the [production app](http://127.0.0.1:3000). Set `PORT` to use another port. The Node server serves both the built app and the API.

## Nano Banana kickoff example

Open `/starter`, connect to Orbis, expand **Livestreaming example**, and click
**Edit and start stream**. The bundled `dog.png` is displayed as the source
image. The server sends it with the displayed image-editing prompt to
`gemini-2.5-flash-image`. Gemini then analyzes the edited image with the user
prompt and returns a plain-text, image-grounded prompt. The
edited output is previewed, uploaded as the Orbis start image, and used with
that grounded prompt to begin the stream.

The two starting prompts are exported from `lib/nano-banana.ts`.
`NANO_BANANA_PROMPT` controls the image edit, while `ORBIS_KICKOFF_PROMPT`
describes the requested motion. The final Gemini-grounded prompt is displayed
before it is sent to Orbis.

## API flow

1. `POST /api/token?model=dynamic` or `POST /api/token?model=stable` requests a single-model session JWT from
   `https://api.reactor.inc/tokens`.
2. `ReactorProvider` connects to the selected model with the
   recv-only `main_video` and `main_audio` tracks.
3. The model sends a `state` snapshot. Its `state.available_resolutions` list
   replaces the starter's initial documented resolution choices.
4. If supplied, the reference image is uploaded and passed to `set_image`
   before `start`.
5. `set_resolution` stages 1080p for the next `start` when Reactor offers it.
   During a Dynamic stream, the resolution menu opens if the session declares live switching.
6. `set_prompt` supplies the required prompt, then `start` begins generation.
7. Sending another `set_prompt` while running steers the video at the next
   chunk boundary.

## Documented model behavior

- A prompt is required before `start`; the reference image is optional.
- A 16:9 reference image works best. Other aspect ratios are resized without
  cropping and may appear distorted.
- The starter initially shows the currently documented `1080p`, `2k`, and `4k`
  tiers. After connection, treat `state.available_resolutions` as authoritative
  and send the selected value exactly as given.
- Stable applies `set_resolution` at the next `start`. Dynamic can apply it in a running session that advertises live switching.
- Orbis emits chunks about every 1.8 seconds. The first chunk emits no frames
  while the upscaler primes; this is expected.
- Commands are asynchronous. Use model events such as `state`,
  `prompt_accepted`, `resolution_accepted`, `generation_started`,
  `chunk_complete`, and `command_error` as the source of truth.
- `pause` takes effect after the current chunk. `resume` continues the same
  generation, and `reset` clears the current prompt and image.

## Project files

- `server/routes/token.ts` performs the server-side token exchange.
- `server/routes/session-cleanup.ts` performs best-effort session deletion when
  the browser page exits.
- `server/routes/session-registry.ts` records verified development sessions for
  startup and shutdown cleanup.
- `scripts/dev-with-session-cleanup.mjs` starts Vite and runs the development
  cleanup sweeps.
- `server/routes/nano-banana.ts` performs the server-side image edit.
- `server/routes/orbis-prompt.ts` creates the image-grounded video prompt.
- `components/orbis-stage.tsx` owns the presentation viewport and directions.
- `components/orbis-demo.tsx` composes the selected model provider and session.
- `components/orbis-player.tsx` renders the streamed video and audio.
- `components/orbis-controls.tsx` renders the session controls.
- `components/nano-banana-example.tsx` owns the kickoff example and source image.
- `hooks/use-orbis-session.ts` contains the reusable Orbis command sequence and
  session state.
- `dog.png` is the Nano Banana source image.
- `lib/orbis.ts` contains the public model configuration and message helpers.
- `lib/orbis-prompt.ts` contains the plain-text Gemini grounding instruction.
- `lib/nano-banana.ts` contains the model and kickoff prompt.
- `.env.example` documents the required environment variables.

For the complete command parameters, message schemas, tracks, and current model
behavior, use the public Reactor documentation:

- [Visko Orbis Stable API](https://www.reactor.inc/models/visko-orbis-stable/api)
- [Gemini image generation and editing](https://ai.google.dev/gemini-api/docs/image-generation)
