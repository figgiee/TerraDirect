"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { OrbisDemo } from "@/components/orbis-demo";
import { OrbisPlayer } from "@/components/orbis-player";
import { BasinView, surveyPitch, surveyWidthMeters, type BasinCapture, type BasinControls, type BasinReport } from "@/components/basin-view";
import { SeasonalSurvey, surveyImageUrl, type SurveyCapture } from "@/components/seasonal-survey";
import type { OrbisSession } from "@/hooks/use-orbis-session";
import { advanceCalendar, firstDay, firstYear, seasonAt, seasonalDirections, yearLength } from "@/lib/basin-calendar";
import { replayYear, weatherSource } from "@/lib/basin-weather";
import { basinPrompt, surveyOpening, surveyRain, directions, evaluationChecks, judges, visualProbes, type EvaluationCheck, type JudgeKey, type Rating } from "@/lib/basin-experiments";

const imageUrl = "/patagonia-valley-reference.jpg";
const openingPrompt = basinPrompt("The boulder rests on the uphill bank as clear water flows along the creek bed.", true, "clear");
type Entry = {
  seed?: string;
  passthrough?: boolean;
  at: string;
  event: string;
  prompt?: string;
  accepted?: boolean;
  chunk?: number;
  ackMs?: number;
  observedMs?: number;
  observedChunk?: number;
};

export function AlpineLab() {
  return <OrbisDemo render={(session) => <Lab session={session} />} />;
}

function Lab({ session }: { session: OrbisSession }) {
  const simulation = useRef<BasinControls>({ survey: true, orbit: true, weather: "clear", release: false, spillway: false, tiled: false, revision: 0, season: seasonAt(replayYear, firstDay, true) });
  const capture = useRef<BasinCapture | null>(null);
  const photoCapture = useRef<SurveyCapture | null>(null);
  const [survey, setSurvey] = useState(true);
  const [photoView, setPhotoView] = useState(true);
  const [highResolution, setHighResolution] = useState(false);
  const [weather, setWeather] = useState<BasinControls["weather"]>("clear");
  const [spillway, setSpillway] = useState(false);
  const [orbit, setOrbit] = useState(true);
  const [inspect, setInspect] = useState(true);
  const [tiled, setTiled] = useState(false);
  const [release, setRelease] = useState(false);
  const [report, setReport] = useState<BasinReport>({ rock: "perched", bypass: 0, sideFlow: 0, outflow: 0, poolDepth: 0, fps: 0 });
  const [prompt, setPrompt] = useState(surveyOpening);
  const [seed, setSeed] = useState<File | null>(null);
  const [useSeed, setUseSeed] = useState(true);
  const [verbatim, setVerbatim] = useState(false);
  const [preview, setPreview] = useState(surveyImageUrl);
  const [seedError, setSeedError] = useState("");
  const [working, setWorking] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [observations, setObservations] = useState<Partial<Record<EvaluationCheck, string>>>({});
  const [receipt, setReceipt] = useState<{ chunk: number; event: string; at: string; sent: number; ackMs: number; observedMs?: number } | null>(null);
  const [ratings, setRatings] = useState<Partial<Record<JudgeKey, Rating>>>({});
  const [probe, setProbe] = useState("");
  const total = judges.every(({ key }) => ratings[key]?.points) ? judges.reduce((sum, { key }) => sum + ratings[key]!.points!, 0) : null;
  const [seedSource, setSeedSource] = useState("Patagonia survey reference");
  const [sunburstBusy, setSunburstBusy] = useState(false);
  const [delivery, setDelivery] = useState<{ width: number; height: number } | null>(null);
  const [historical, setHistorical] = useState(true);
  const [calendar, setCalendar] = useState({ year: replayYear, day: firstDay });
  const [calendarPlaying, setCalendarPlaying] = useState(false);
  const [calendarSpeed, setCalendarSpeed] = useState(3);
  const cycle = seasonAt(calendar.year, calendar.day, historical);

  useEffect(() => { simulation.current.season = cycle; }, [cycle.snow, cycle.foliage, cycle.inflow]);

  useEffect(() => {
    if (!calendarPlaying) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const days = Math.min((now - previous) / 1000, 1) * calendarSpeed;
      previous = now;
      setCalendar(({ year, day }) => advanceCalendar(year, day, days, historical));
    }, 125);
    return () => window.clearInterval(timer);
  }, [calendarPlaying, calendarSpeed, historical]);

  function scenePrompt(action: string, weatherMode = weather) {
    if (!survey) return basinPrompt(action, orbit, weatherMode);
    if (weatherMode === "storm" && !action) return surveyRain;
    return `${action} Keep the same fixed wide aerial camera, granite ridge and foreground creek bend. ${weatherMode === "clear" ? "" : "Rain falls across the valley."}`.trim();
  }

  function add(event: string, details?: Omit<Entry, "event"> | Omit<Entry, "at" | "event">) {
    setEntries((current) => [...current, { at: new Date().toISOString(), event, ...details }]);
  }

  async function steer(direction: string, event = "Live prompt") {
    if (!session.runStarted || session.controlsBusy) return;
    const chunk = session.chunks;
    const at = new Date().toISOString();
    const sent = performance.now();
    const accepted = await session.steer(direction, verbatim);
    const ackMs = Math.round(performance.now() - sent);
    if (accepted) setReceipt({ chunk, event, at, sent, ackMs });
    add(event, { at, prompt: direction, accepted, chunk, ackMs, passthrough: verbatim });
  }

  function markVisible() {
    if (!receipt || receipt.observedMs !== undefined) return;
    const observedMs = Math.round(performance.now() - receipt.sent);
    setEntries((current) => current.map((entry) =>
      entry.at === receipt.at && entry.event === receipt.event
        ? { ...entry, observedMs, observedChunk: session.chunks }
        : entry,
    ));
    setReceipt({ ...receipt, observedMs });
    session.noteActivity();
  }

  async function startOrSteer(event: FormEvent) {
    event.preventDefault();
    if (working || session.controlsBusy || !prompt.trim()) return;
    if (session.runStarted) return steer(prompt);
    if (!session.connected) return;
    setWorking(true);
    setSeedError("");
    try {
      let reference = useSeed ? seed : null;
      if (useSeed && !reference) {
        const response = await fetch(survey ? surveyImageUrl : imageUrl);
        if (!response.ok) throw new Error("Could not load the basin seed.");
        reference = new File([await response.blob()], "alpine-basin.jpg", { type: "image/jpeg" });
      }
      const at = new Date().toISOString();
      const sent = performance.now();
      setDelivery(null);
      const accepted = await session.startFromImage(reference, prompt, verbatim);
      const ackMs = Math.round(performance.now() - sent);
      const label = reference ? "Seeded start" : "Text-only start";
      setReceipt(accepted ? { chunk: 0, event: label, at, sent, ackMs } : null);
      add(label, { at, prompt, accepted, chunk: 0, ackMs, seed: useSeed ? seedSource : undefined, passthrough: verbatim });
      if (accepted) setPrompt("");
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Could not load the seed image.");
    } finally {
      setWorking(false);
    }
  }

  async function setReference(file: Blob, name: string) {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser could not prepare the seed.");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const width = bitmap.width * scale, height = bitmap.height * scale;
      ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
      if (!jpeg) throw new Error("The seed could not be converted to JPEG.");
      setPreview(canvas.toDataURL("image/jpeg", 0.86));
      setSeed(new File([jpeg], name, { type: "image/jpeg" }));
      setUseSeed(true);
    } finally {
      bitmap.close();
    }
  }

  async function uploadSeed(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSeedError("");
    try { await setReference(file, "uploaded-basin.jpg"); setSeedSource("Uploaded seed"); }
    catch { setSeedError("Choose a supported still image for the seed."); }
    event.target.value = "";
  }

  async function captureSeed() {
    setSeedError("");
    try {
      const frame = capture.current?.(true);
      if (!frame) throw new Error("The 3D viewport is not ready to capture.");
      const response = await fetch(frame);
      await setReference(await response.blob(), "simulation-basin.jpg");
      setSeedSource("Captured 3D frame");
      setPrompt(survey ? surveyOpening : openingPrompt);
      add("Simulation frame used as seed");
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Could not capture the simulation.");
    }
  }

  function downloadCapture() {
    const frame = survey && photoView ? photoCapture.current?.() : capture.current?.();
    if (!frame) { setSeedError("The terrain view is not ready to capture."); return; }
    const link = document.createElement("a");
    link.href = frame;
    link.download = survey && photoView ? "patagonia-season-4k.jpg" : survey ? "patagonia-survey-4k.jpg" : "patagonia-tile-4k.jpg";
    link.click();
  }

  function changeView(nextSurvey: boolean) {
    simulation.current.survey = nextSurvey;
    setSurvey(nextSurvey);
    if (!session.runStarted) {
      setPrompt(nextSurvey ? surveyOpening : openingPrompt);
      setSeed(null);
      setPreview(nextSurvey ? surveyImageUrl : imageUrl);
      setUseSeed(nextSurvey);
      setSeedSource(nextSurvey ? "Patagonia survey reference" : "Patagonia study");
    }
  }

  async function generateSeed() {
    setSunburstBusy(true);
    setSeedError("");
    try {
      const response = await fetch("/api/sunburst", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Sunburst could not generate the seed.");
      }
      await setReference(await response.blob(), "sunburst-basin.jpg");
      setSeedSource("Sunburst edit");
      add("Sunburst seed prepared");
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : "Could not prepare the Sunburst seed.");
    } finally {
      setSunburstBusy(false);
    }
  }

  function changeWeather(next: BasinControls["weather"]) {
    simulation.current.weather = next;
    setWeather(next);
    const action = next === "clear" ? "The rain ends and sunlight returns through gaps in the clouds." : survey && next === "cloudburst" ? "Rain intensifies across the entire valley." : "";
    const event = next === "clear" ? "Rain eases" : next === "cloudburst" ? "Cloudburst" : "Storm on";
    if (session.runStarted) void steer(scenePrompt(action, next), event);
    else add(`Local: ${event}`);
  }

  function openSpillway() {
    simulation.current.spillway = true;
    setSpillway(true);
    if (session.runStarted) void steer(scenePrompt(directions.breach), "Release impounded water");
    else add("Local: release impounded water");
  }

  function releaseRock() {
    simulation.current.release = true;
    setRelease(true);
    if (session.runStarted) void steer(scenePrompt(directions.rock), "Rockfall only");
    else add("Local rockfall");
  }

  function toggleOrbit() {
    const next = !orbit;
    simulation.current.orbit = next;
    setOrbit(next);
    if (session.runStarted) {
      void steer(basinPrompt("The camera continues in one continuous shot.", next, weather), next ? "Orbit" : "Hold view");
    } else add(next ? "Local orbit" : "Local view held");
  }

  function reset() {
    simulation.current = { ...simulation.current, orbit: true, weather: "clear", release: false, spillway: false, revision: simulation.current.revision + 1 };
    setOrbit(true);
    setWeather("clear");
    setSpillway(false);
    setRelease(false);
    setPrompt(survey ? surveyOpening : openingPrompt);
    setReceipt(null);
    if (session.runStarted) void session.reset();
    add("Reset basin");
  }

  function exportRun() {
    const data = { preset: "patagonia", view: survey ? photoView ? "fixed aerial image" : "survey" : "diorama", tiltDegrees: survey ? surveyPitch : 25, areaMeters: [surveyWidthMeters, surveyWidthMeters], terrain: "synthetic", simulation: { ...report, calendar, season: cycle.season, regionalWeather: cycle.weather, weatherSource: historical ? weatherSource : undefined }, orbis: { seedSource, delivery, chunks: session.chunks, observations, entries }, judging: { ratings, total } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "alpine-basin-run.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const locked = working || session.controlsBusy || sunburstBusy;
  const liveReceipt = session.runStarted ? receipt : null;
  const runError = session.error || seedError;
  return (
    <main className="basin-lab">
      <header className="lab-head">
        <div className="lab-title">
          <h1>Patagonia <strong>Live</strong></h1>
        </div>
        <p className="camera-status">{survey ? "25° off nadir · Locked" : `25° down · ${orbit ? "Slow orbit" : "Held view"}`}</p>
      </header>

      <div className={session.runStarted ? `lab-stage ${inspect ? "compare-active" : "orbis-first"}` : "lab-stage local-first"}>
        <section className="lab-panel live-panel" aria-labelledby="orbis-title">
          <div className="panel-head">
            <h2 id="orbis-title">Orbis Stable</h2>
            <span className={`session-state session-${session.status}`} aria-live="polite">
              {session.status}
              {session.runStarted && ` · ${session.chunks} chunks`}
              {session.runStarted && delivery
                ? ` · ${delivery.width} × ${delivery.height}`
                : session.resolution && ` · ${session.resolution}`}
            </span>
          </div>
          {(session.runStarted || (useSeed && seed !== null)) && <div className="orbis-frame">
            {session.runStarted ? <OrbisPlayer connected={session.connected} muted={session.muted} runStarted={session.runStarted} status={session.status} onSize={setDelivery} /> : <img src={preview} alt="Aerial reference of a Patagonian creek, granite slopes, and lenga woodland" />}
          </div>}
          <div className="actions event-actions">
            <button type="button" aria-pressed={weather !== "clear"} onClick={() => changeWeather(weather === "clear" ? "storm" : "clear")} disabled={locked}>{weather === "clear" ? "Start storm" : "End storm"}</button>
            <button type="button" aria-pressed={weather === "cloudburst"} onClick={() => changeWeather("cloudburst")} disabled={locked || weather === "cloudburst"}>Cloudburst</button>
            <button type="button" onClick={releaseRock} disabled={release || locked}>Release boulder</button>
            <button type="button" onClick={openSpillway} disabled={locked || spillway || report.rock !== "lodged"}>Open spillway</button>
            {!survey && <button type="button" onClick={toggleOrbit} disabled={locked}>{orbit ? "Hold view" : "Start slow orbit"}</button>}
            <button type="button" onClick={reset} disabled={locked}>Reset</button>
            {session.runStarted && <button className="inspect-toggle" type="button" aria-pressed={inspect} onClick={() => setInspect(!inspect)}>Compare simulation</button>}
          </div>
          <form className="orbis-form" onSubmit={startOrSteer}>
            <label htmlFor="direction">{session.runStarted ? "Steering prompt" : "Opening prompt"}</label>
            <textarea id="direction" value={prompt} rows={3} onChange={(event) => { setPrompt(event.target.value); if (session.connected) session.noteActivity(); }} placeholder="Describe one change in the scene…" />
            <div className="actions">
              {session.connected ? <>
                <button type="submit" className="primary" disabled={locked || !prompt.trim()}>{session.runStarted ? "Steer live" : useSeed ? "Start from seed" : "Start from text"}</button>
                <button type="button" disabled={locked} onClick={() => void session.disconnectSession()}>Disconnect</button>
                {session.runStarted && <button type="button" onClick={session.toggleMuted}>{session.muted ? "Unmute" : "Mute"}</button>}
              </> : <button type="button" className="primary" disabled={locked || session.status !== "disconnected"} onClick={() => void session.connectSession()}>{session.status === "disconnected" ? "Connect Orbis" : "Connecting…"}</button>}
              {!session.runStarted && <>
                <label className="seed-switch"><input type="checkbox" checked={useSeed} disabled={locked} onChange={(event) => setUseSeed(event.target.checked)} /> Use seed</label>
                <label className="upload-label">Upload seed<input type="file" accept="image/*" disabled={locked} onChange={uploadSeed} /></label>
                <button type="button" disabled={locked} onClick={() => void captureSeed()}>Use 3D frame</button>
                <button type="button" disabled={locked} onClick={() => void generateSeed()}>{sunburstBusy ? "Editing seed…" : "Try Sunburst"}</button>
              </>}
            </div>
            <label className="seed-switch" title="Send the prompt unchanged instead of using Reactor’s prompt preparation">
              <input type="checkbox" checked={verbatim} disabled={locked} onChange={(event) => {
                setVerbatim(event.target.checked);
                if (session.connected) session.noteActivity();
              }} /> Send exact text
            </label>
            {session.runStarted && <div className="optics">
              <button type="button" disabled={locked} onClick={() => void steer(scenePrompt(seasonalDirections[cycle.season]), `Season: ${cycle.season}`)}>Send {cycle.season.toLowerCase()} to Orbis</button>
              <button type="button" disabled={!receipt || receipt.observedMs !== undefined} onClick={markVisible}>{receipt?.observedMs !== undefined ? `Seen at ${receipt.observedMs} ms` : "Mark visible"}</button>
              <button type="button" disabled={locked} onClick={() => void steer(scenePrompt(directions.reroute), "Direct the diversion")}>Direct the diversion</button>
              <label className="probe">Orbis-only experiments
                <select value={probe} onChange={(event) => {
                  const selected = visualProbes.find(({ name }) => name === event.target.value);
                  setProbe(event.target.value);
                  if (selected) { setPrompt(selected.prompt); session.noteActivity(); }
                }}><option value="">Choose a prompt</option>{visualProbes.map(({ name }) => <option key={name}>{name}</option>)}</select>
              </label>
            </div>}
          </form>
          <div className="run-feedback" aria-live="polite" data-intervention={Boolean(runError)}>
            {runError && <span className="feedback-label">Action needed</span>}
            <span>{runError || session.sessionNotice || (liveReceipt && `${liveReceipt.event} acknowledged in ${liveReceipt.ackMs} ms · ${Math.max(0, session.chunks - liveReceipt.chunk)} subsequent chunks`) || session.imageStatus || (session.connected ? "Connected. Submit the opening prompt to start." : "Orbis offline. Local controls available.")}</span>
            {liveReceipt && !runError && session.imageStatus && <span>{session.imageStatus}</span>}
          </div>
        </section>
        <section className="lab-panel inspection-panel" aria-labelledby="terrain-title" hidden={!inspect && session.runStarted}>
          <div className="panel-head"><h2 id="terrain-title">{survey && photoView ? "Seasonal survey" : survey ? "3D runoff" : "Terrain tile"}</h2><span>{survey && photoView ? "Fixed aerial reference" : "2 km × 2 km · Synthetic terrain"}</span></div>
          {survey && photoView && <SeasonalSurvey season={cycle} weather={weather} flow={report.outflow} highResolution={highResolution} capture={photoCapture} />}
          <BasinView controls={simulation} onReport={setReport} capture={capture} hidden={survey && photoView} />
          <div className="timeline" aria-label="Seasonal timeline">
            <strong>{cycle.label}, {calendar.year} · {cycle.season}</strong>
            <input aria-label="Day of year" aria-valuetext={`${cycle.label}, ${calendar.year} · ${cycle.season}`} type="range" min={0} max={yearLength(calendar.year) - 1} value={Math.floor(calendar.day)} onChange={(event) => {
              setCalendarPlaying(false);
              setCalendar({ year: calendar.year, day: Number(event.target.value) });
            }} />
            <button type="button" onClick={() => setCalendarPlaying(!calendarPlaying)}>{calendarPlaying ? "Pause year" : "Play year"}</button>
            <select aria-label="Calendar speed" value={calendarSpeed} onChange={(event) => setCalendarSpeed(Number(event.target.value))}>
              <option value={1}>1 day/s</option><option value={3}>3 days/s</option><option value={7}>7 days/s</option><option value={21}>21 days/s</option>
            </select>
            <select aria-label="Timeline source" value={historical ? "history" : "scenario"} onChange={(event) => {
              const replay = event.target.value === "history";
              setCalendarPlaying(false);
              setHistorical(replay);
              setCalendar({ year: replay ? replayYear : firstYear, day: firstDay });
            }}>
              <option value="history">El Chaltén 2025</option><option value="scenario">Seasonal scenario</option>
            </select>
          </div>
          {cycle.weather && <p className="replay-weather">
            <span><strong>{cycle.weather.temperature.toFixed(1)} °C</strong> mean</span>
            <span><strong>{cycle.weather.rain.toFixed(1)} mm</strong> rain</span>
            <span><strong>{cycle.weather.snow.toFixed(1)} cm</strong> snowfall</span>
            <span><strong>{Math.round(cycle.weather.cloud * 100)}%</strong> cloud</span>
            <span><strong>{cycle.weather.wind.toFixed(1)} km/h</strong> peak wind</span>
            <span><strong>{cycle.weather.daylight.toFixed(1)} h</strong> daylight</span>
            <a href={weatherSource.apiDocumentation} title="9 km regional gridded weather estimates. Snow cover and runoff are modeled.">ECMWF IFS via Open-Meteo · 9 km</a>
          </p>}
          <div className="sim-readouts">
            <div><span>Boulder</span><strong>{report.rock}</strong></div>
            <div><span>Side-channel flow</span><strong>{Math.round(report.bypass * 100)}<small>%</small></strong></div>
            <div><span>{survey && photoView ? "Aerial preview" : "Render"}</span><strong>{survey && photoView ? highResolution ? "4K" : "Auto" : <>{report.fps || "–"} <small>fps</small></>}</strong></div>
          </div>
          <p className="hydrology-readout">Upstream depth <strong>{report.poolDepth.toFixed(1)}</strong> · Side flow <strong>{report.sideFlow.toFixed(2)}</strong> · Outlet flow <strong>{report.outflow.toFixed(2)}</strong><span>Simulation units</span></p>
          <div className="actions">
            <button type="button" aria-pressed={survey && photoView} disabled={survey && photoView || locked || session.runStarted && !survey} onClick={() => { if (!survey) changeView(true); setPhotoView(true); }}>Survey</button>
            <button type="button" aria-pressed={survey && !photoView} disabled={survey && !photoView || locked || session.runStarted && !survey} onClick={() => { if (!survey) changeView(true); setPhotoView(false); }}>3D runoff</button>
            <button type="button" aria-pressed={!survey} disabled={!survey || locked || session.runStarted} onClick={() => changeView(false)}>Diorama</button>
            <button type="button" onClick={downloadCapture}>Capture 4K</button>
            {survey && photoView && <button type="button" aria-pressed={highResolution} title="Render live effects at 3840 × 2160 over the fixed 1672 × 941 source" onClick={() => setHighResolution(!highResolution)}>Live 4K</button>}
            {!survey && <button type="button" aria-pressed={tiled} onClick={() => {
              simulation.current.tiled = !tiled;
              setTiled(!tiled);
            }}>Tile preview</button>}
          </div>
          {!survey && tiled && <p className="tile-detail">Mirrored neighbors · Water measured in the center basin</p>}
        </section>

      </div>

      <section className="experiment-log" aria-labelledby="log-title">
        <div className="panel-head"><h2 id="log-title">Run observations</h2><button type="button" onClick={exportRun}>Export run JSON ↓</button></div>
        <div className="observation-grid">
          {evaluationChecks.map((check) => <label key={check}>{check}<select value={observations[check] || ""} onChange={(event) => setObservations((current) => ({ ...current, [check]: event.target.value }))}><option value="">Unscored</option><option>Observed</option><option>Failed</option><option>Inconclusive</option></select></label>)}
        </div>
        {entries.length > 0 && <ol className="entries">{entries.slice(-5).reverse().map((entry, i) => <li key={entry.at + i}><time>{entry.at.slice(11, 19)} UTC</time><span>{entry.event}</span>{entry.accepted !== undefined && <strong>{entry.accepted ? `ACK ${entry.ackMs ?? 0} MS${entry.observedMs === undefined ? "" : ` · SEEN ${entry.observedMs} MS`}` : "REJECTED"}</strong>}</li>)}</ol>}
      </section>
      <section className="experiment-log judge-panel" aria-labelledby="judging-title">
        <div className="panel-head"><h2 id="judging-title">Judge the run</h2><span>{total === null ? "Score all three criteria" : `${total} / 15`}</span></div>
        <div className="judge-grid">{judges.map((judge) => <div className="judge-card" key={judge.key}>
          <p>{judge.name}</p>
          <label>{judge.criterion}
            <select value={ratings[judge.key]?.points ?? ""} onChange={(event) => setRatings((current) => ({
              ...current, [judge.key]: { ...current[judge.key], points: Number(event.target.value) || undefined },
            }))}>
              <option value="">Unscored</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
            </select>
          </label>
          <p>{judge.question}</p>
          <input aria-label={`${judge.criterion} critique`} placeholder="Add a critique" value={ratings[judge.key]?.critique ?? ""} onChange={(event) => setRatings((current) => ({
            ...current, [judge.key]: { ...current[judge.key], critique: event.target.value },
          }))} />
        </div>)}</div>
      </section>
      <footer className="lab-footer"><a href="/starter">Visko starter ↗</a></footer>
    </main>
  );
}
