import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { OrbisDemo } from "@/components/orbis-demo";
import { OrbisPlayer } from "@/components/orbis-player";
import type { OrbisSession } from "@/hooks/use-orbis-session";
import { type OrbisModel } from "@/lib/orbis";
import { padTerrainSeed, satelliteEvents, stageViews, terrainSeedBackground, terrainSeedScale, timelinePaces, type StageView, type TimelinePace } from "@/lib/orbis-stage";

const defaultPace = "fast" satisfies TimelinePace;
type Size = { width: number; height: number };
type Direction = {
  label: string;
  text: string;
  at: string;
  chunk: number;
  videoSeconds?: number;
  beforeFrame?: string;
  accepted: boolean;
  acknowledgmentMs: number;
  requestedPace?: TimelinePace;
  visibleMs?: number;
  visibleVideoSeconds?: number;
  visibleFrame?: string;
};
type Run = {
  model: OrbisModel;
  view: StageView;
  requestedResolution: string;
  startedAt: string;
  opening: string;
  startingFrame: string;
  firstFrameMs?: number;
  delivery?: Size;
  error?: string;
  modelFps?: number;
  modelChunkCap?: number;
  chunks?: number;
  reportedDelivery?: string | null;
  imageConditioned?: boolean;
  liveResolutionSwitching?: boolean;
  directions: Direction[];
};

const capacityError = /no available capacity|no available servers/i;

function captureFrame(video?: HTMLVideoElement | null) {
  if (!video?.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(video.videoWidth, 960);
  canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
  const context = canvas.getContext("2d");
  if (!context) return;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return undefined;
  }
}

function connectionMessage(error: string) {
  if (capacityError.test(error)) return "The stream is at capacity. Try again.";
  if (/\b429\b/.test(error)) return "Reactor is limiting new streams. Wait before trying again.";
  if (/\b402\b/.test(error)) return "The Reactor account needs credits to start a stream.";
  return error;
}

export default function OrbisStage() {
  const [view] = useState<StageView>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested && Object.hasOwn(stageViews, requested) ? requested as StageView : "satellite";
  });
  const [model, setModel] = useState<OrbisModel>("dynamic");
  const [presenting, setPresenting] = useState(false);
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const restoreModelFocus = useRef(false);
  const viewer = useRef<Window | null>(null);
  const viewerTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const handleFullscreen = () => setPresenting(document.fullscreenElement === fullscreenRoot.current);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreen);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => () => {
    window.clearInterval(viewerTimer.current);
    viewer.current?.close();
  }, []);

  useEffect(() => {
    if (!restoreModelFocus.current) return;
    restoreModelFocus.current = false;
    fullscreenRoot.current?.querySelector<HTMLInputElement>('.stage-model-toggle input:checked')?.focus();
  }, [model]);

  function changeModel(next: OrbisModel) {
    restoreModelFocus.current = true;
    setModel(next);
  }

  async function present(noteActivity: () => void) {
    noteActivity();
    window.clearInterval(viewerTimer.current);
    const source = fullscreenRoot.current?.querySelector("video");
    if (source?.srcObject instanceof MediaStream) {
      const audience = window.open("", "patagonia-live-viewer", "popup,width=1280,height=720");
      if (audience) {
        viewer.current = audience;
        audience.document.title = "Viewer";
        audience.document.body.style.cssText = "margin:0;background:#000;overflow:hidden";
        const video = audience.document.createElement("video");
        video.style.cssText = "display:block;width:100vw;height:100vh;object-fit:contain";
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = source.srcObject;
        video.ondblclick = () => {
          if (audience.document.fullscreenElement) void audience.document.exitFullscreen().catch(() => {});
          else void video.requestFullscreen().catch(() => {});
        };
        audience.document.body.replaceChildren(video);
        void video.play().catch(() => {});
        viewerTimer.current = window.setInterval(() => {
          if (audience.closed || !source.isConnected) closeViewer();
          else noteActivity();
        }, 25000);
        return;
      }
    }

    setPresenting(true);
    try {
      await fullscreenRoot.current?.requestFullscreen?.();
    } catch {
      // Escape also exits the video-only layout in an embedded browser.
    }
    viewerTimer.current = window.setInterval(() => {
      if (fullscreenRoot.current?.querySelector(".is-presenting video")) noteActivity();
      else window.clearInterval(viewerTimer.current);
    }, 25000);
  }

  function closeViewer() {
    window.clearInterval(viewerTimer.current);
    viewer.current?.close();
    viewer.current = null;
  }

  return <div ref={fullscreenRoot}>
    <OrbisDemo model={model} render={(session) => (
      <Stage view={view} model={model} onModelChange={changeModel}
        session={session} presenting={presenting} present={present} closeViewer={closeViewer} />
    )} />
  </div>;
}

function Stage({ session, view, model, onModelChange, presenting, present, closeViewer }: {
  session: OrbisSession;
  view: StageView;
  model: OrbisModel;
  onModelChange: (model: OrbisModel) => void;
  presenting: boolean;
  present: (noteActivity: () => void) => Promise<void>;
  closeViewer: () => void;
}) {
  const stage = useRef<HTMLElement>(null);
  const [prompt, setPrompt] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [pending, setPending] = useState(false);
  const [sendingDirection, setSendingDirection] = useState("");
  const [problem, setProblem] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [receipt, setReceipt] = useState<{ index: number; label: string; sent: number } | null>(null);
  const startTime = useRef(0);
  const actionInFlight = useRef(false);
  const observedFrame = useRef(false);

  const busy = pending || session.controlsBusy || session.status === "connecting" || session.status === "waiting";
  const readyToSteer = session.runStarted && hasFrame && !session.paused && !busy;
  const issue = problem || (session.error ? connectionMessage(session.error) : "");
  const scene = stageViews[view];
  const wideSeed = view === "terrain";

  useEffect(() => {
    if (!session.runStarted) {
      observedFrame.current = false;
      setHasFrame(false);
      setReceipt(null);
    }
  }, [session.runStarted]);

  useEffect(() => {
    if (!session.runStarted) return;
    setRun((current) => current ? {
      ...current,
      modelFps: session.generation?.fps,
      modelChunkCap: session.generation?.max_chunks,
      imageConditioned: session.generation?.image_conditioned,
      liveResolutionSwitching: session.liveResolutionSwitching,
      chunks: session.chunks,
      reportedDelivery: session.delivered,
    } : null);
  }, [session.runStarted, session.generation, session.chunks, session.delivered, session.liveResolutionSwitching]);

  const handleSize = useCallback((size: Size) => {
    setRun((current) => current ? { ...current, delivery: size } : null);
  }, []);

  const handleFirstFrame = useCallback(() => {
    if (observedFrame.current) return;
    observedFrame.current = true;
    setHasFrame(true);
    const elapsed = Math.round(performance.now() - startTime.current);
    setRun((current) => current ? { ...current, firstFrameMs: elapsed } : null);
  }, []);

  async function start() {
    if (busy || session.runStarted || actionInFlight.current) return;
    actionInFlight.current = true;
    setPending(true);
    setProblem("");
    setPrompt("");
    observedFrame.current = false;
    setHasFrame(false);
    startTime.current = performance.now();
    setRun({
      model,
      view,
      requestedResolution: session.resolution || "model setting",
      startedAt: new Date().toISOString(),
      startingFrame: scene.frameName,
      opening: scene.opening,
      directions: [],
    });
    try {
      const response = await fetch(scene.frame);
      if (!response.ok) throw new Error("The starting frame could not load.");
      const source = await response.blob();
      const image = new File([wideSeed ? await padTerrainSeed(source) : source], "patagonia-start.jpg", { type: "image/jpeg" });
      const accepted = await session.connectAndStart(image, scene.opening, true);
      if (!accepted) setRun((current) => current ? { ...current, error: "Orbis startup failed" } : null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The stream could not start.";
      setProblem(message);
      setRun((current) => current ? { ...current, error: message } : null);
    } finally {
      setPending(false);
      actionInFlight.current = false;
    }
  }

  async function switchModel() {
    if (busy || actionInFlight.current || session.runStarted && hasFrame) return;
    actionInFlight.current = true;
    setPending(true);
    try {
      if (session.connected && !await session.disconnectSession()) return;
      closeViewer();
      onModelChange(model === "dynamic" ? "stable" : "dynamic");
    } finally {
      actionInFlight.current = false;
      setPending(false);
    }
  }

  async function steer(label: string, text: string, { clearDraft = false, instant = false } = {}) {
    const direction = text.trim();
    if (!direction || !readyToSteer || actionInFlight.current) return false;
    actionInFlight.current = true;
    setSendingDirection(label);
    setReceipt(null);
    const at = new Date().toISOString();
    const chunk = session.chunks;
    const video = stage.current?.querySelector("video");
    const videoSeconds = video?.currentTime;
    const beforeFrame = captureFrame(video);
    const sent = performance.now();
    const index = run?.directions.length ?? 0;
    const usePace = view === "satellite" && !instant;
    const fullDirection = usePace ? direction + " " + timelinePaces[defaultPace].direction : direction;
    try {
      const accepted = await session.steer(fullDirection, true);
      const acknowledgmentMs = Math.round(performance.now() - sent);
      setRun((current) => current ? { ...current, directions: [
        ...current.directions, { label, text: fullDirection, at, chunk, videoSeconds, beforeFrame, accepted, acknowledgmentMs,
          requestedPace: usePace ? defaultPace : undefined },
      ] } : null);
      if (accepted) {
        if (clearDraft) setPrompt("");
        setReceipt({ index, label, sent });
      }
      return accepted;
    } finally {
      actionInFlight.current = false;
      setSendingDirection("");
    }
  }

  function markVisible() {
    if (!receipt) return;
    const visibleMs = Math.round(performance.now() - receipt.sent);
    const video = stage.current?.querySelector("video");
    const visibleVideoSeconds = video?.currentTime;
    const visibleFrame = captureFrame(video);
    setRun((current) => current ? { ...current, directions: current.directions.map((direction, index) =>
      index === receipt.index ? { ...direction, visibleMs, visibleVideoSeconds, visibleFrame } : direction,
    ) } : null);
    setReceipt(null);
    session.noteActivity();
  }

  function exportRun() {
    if (!run) return;
    const evidence = { ...run, error: session.error || run.error };
    const url = URL.createObjectURL(new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "patagonia-" + model + "-run.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void steer("Custom direction", prompt, { clearDraft: true });
  };
  const status = session.runStarted
    ? session.paused ? "Paused" : hasFrame ? "Live" : "Waiting for video"
    : session.status === "waiting" ? "Waiting for Orbis"
      : session.status === "connecting" ? "Connecting"
        : busy ? "Starting stream" : issue ? "Stream unavailable" : "Scene preview";
  const lastDirection = run?.directions.at(-1);

  function sendRandomEvent() {
    const choices = satelliteEvents.filter(([label]) => label !== lastDirection?.label);
    const [label, event] = choices[Math.floor(Math.random() * choices.length)];
    return steer(label, `${event} Hold the wide photoreal aerial view of the same valley.`, { instant: true });
  }

  return (
    <main className={presenting ? "orbis-stage is-presenting" : "orbis-stage"} ref={stage}>
      <section className="stage-monitor" aria-label="Orbis viewport">
        <div className="stage-monitor-bar">
          <span className="stage-state" data-state={session.runStarted && hasFrame && !session.paused ? "live" : issue ? "error" : busy || session.runStarted && !hasFrame ? "busy" : "idle"} role="status">
            <span className="stage-light" aria-hidden="true" />{status}
          </span>
          <div className="stage-monitor-tools">
            {(!session.runStarted || !hasFrame) && <div className="stage-model-toggle" role="radiogroup" aria-label="Orbis model" data-model={model}>
              <label>
                <input type="radio" name="stage-model" value="dynamic" checked={model === "dynamic"} disabled={busy}
                  onChange={() => void switchModel()} />
                <span>Dynamic</span>
              </label>
              <label>
                <input type="radio" name="stage-model" value="stable" checked={model === "stable"} disabled={busy}
                  onChange={() => void switchModel()} />
                <span>Stable</span>
              </label>
            </div>}
            {!session.runStarted && <button className="stage-primary" type="button" disabled={busy} onClick={() => void start()}>Start stream</button>}
            {session.runStarted && <div className="stage-transport" aria-label="Stream controls">
              <button type="button" disabled={busy || !hasFrame} onClick={() => void (session.paused ? session.resume() : session.pause())}>{session.paused ? "Resume" : "Pause"}</button>
              <button type="button" aria-pressed={!session.muted} onClick={session.toggleMuted}>{session.muted ? "Enable sound" : "Mute"}</button>
              <button type="button" disabled={!hasFrame} onClick={() => void present(session.noteActivity)}>Present</button>
            </div>}
            {session.connected && <button className="stage-stop" type="button" disabled={busy} onClick={() => { closeViewer(); void session.disconnectSession(); }}>End stream</button>}
          </div>
        </div>
        <div className="stage-picture" style={wideSeed && !session.runStarted ? { backgroundColor: terrainSeedBackground } : undefined}>
          {session.runStarted ? <OrbisPlayer connected={session.connected} muted={session.muted} runStarted={session.runStarted} status={session.status} onSize={handleSize} onFirstFrame={handleFirstFrame} showStatus={false} /> : <>
            <img src={scene.frame} alt={scene.frameName} style={wideSeed ? { scale: terrainSeedScale } : undefined} />
          </>}
          {(busy && !session.runStarted || session.runStarted && !hasFrame) && <div className="stage-wait">
            <span className="stage-spinner" aria-hidden="true" />
            <strong>{status}…</strong>
          </div>}
        </div>

        <div className="stage-dock">
          <div className="stage-history"
            onPointerEnter={(event) => { if (event.pointerType === "mouse") setHistoryOpen(true); }}
            onPointerLeave={(event) => { if (event.pointerType === "mouse") setHistoryOpen(false); }}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setHistoryOpen(false); }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && historyOpen) {
                setHistoryOpen(false);
                event.currentTarget.querySelector("button")?.focus();
                event.stopPropagation();
              }
            }}>
            <button type="button" aria-expanded={historyOpen} aria-controls="stage-prompt-history"
              onClick={() => setHistoryOpen((open) => !open)}>
              History{run?.directions.length ? <span className="stage-count">{run.directions.length}</span> : null}
            </button>
            <div id="stage-prompt-history" className="stage-history-panel" tabIndex={0} aria-label="Prompt history" hidden={!historyOpen}>
              {run ? <ol>
                {run.directions.toReversed().map((direction) => <li key={direction.at}>
                  <strong>{direction.label}</strong>
                  <small>{direction.visibleMs !== undefined
                    ? `Marked visible · ${(direction.visibleMs / 1000).toFixed(1)} s`
                    : direction.accepted ? "Sent" : "Failed"}</small>
                  <p>{direction.text}</p>
                  {(direction.beforeFrame || direction.visibleFrame) && <div className="stage-history-frames">
                    {direction.beforeFrame && <figure>
                      <img src={direction.beforeFrame} alt="Valley before this prompt was sent" />
                      <figcaption>Before</figcaption>
                    </figure>}
                    {direction.visibleFrame && <figure>
                      <img src={direction.visibleFrame} alt="Valley when the operator marked the change visible" />
                      <figcaption>Marked visible</figcaption>
                    </figure>}
                  </div>}
                </li>)}
                <li><strong>Opening prompt</strong><p>{run.opening}</p></li>
              </ol> : <p>Prompts appear here after you start a stream.</p>}
            </div>
          </div>
          <form onSubmit={submit} className="stage-steer">
            <label htmlFor="stage-direction">{view === "satellite" ? "Direct the time-lapse" : "Direct the scene"}</label>
            <div className="stage-command">
              <input id="stage-direction" value={prompt} placeholder="Describe a change" disabled={!session.runStarted} onChange={(event) => {
                setPrompt(event.target.value);
                session.noteActivity();
              }} />
              <button type="submit" className={session.runStarted ? "stage-primary" : ""} disabled={!readyToSteer || !prompt.trim()}>Apply</button>
            </div>
          </form>
          <div className="stage-quick" aria-label="Scene directions">
            {view === "satellite" && <button type="button" className="stage-primary" disabled={!readyToSteer} onClick={() => void sendRandomEvent()}>Random event</button>}
            {(view === "satellite" ? scene.directions.slice(0, 1) : scene.directions).map((direction) => <button type="button" key={direction.label} disabled={!readyToSteer} onClick={() => void steer(direction.label, direction.text)}>{direction.label}</button>)}
            {view === "satellite" && <select className="stage-more-events" aria-label="More events" value="" disabled={!readyToSteer} onChange={(event) => {
              const direction = scene.directions.find(({ label }) => label === event.target.value);
              if (direction) void steer(direction.label, direction.text);
            }}>
              <option value="" disabled>More events</option>
              {scene.directions.slice(1).map(({ label }) => <option key={label} value={label}>{label}</option>)}
            </select>}
          </div>
        </div>

        <div className="stage-foot">
          {issue ? <p className="stage-problem" role="alert">{issue}</p>
            : session.sessionNotice ? <p role="status">{session.sessionNotice}</p>
            : receipt ? <p role="status">{receipt.label} sent</p>
              : session.runStarted && lastDirection?.visibleMs !== undefined ? <p role="status">{lastDirection.label} marked visible</p>
                : sendingDirection ? <p role="status">Sending {sendingDirection}…</p> : null}
          {receipt && <button type="button" onClick={markVisible}>Mark change visible</button>}
          {!presenting && run && !busy && <button type="button" onClick={exportRun}>Download run</button>}
        </div>
      </section>
    </main>
  );
}
