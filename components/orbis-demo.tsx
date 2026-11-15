"use client";

import { ReactorProvider } from "@reactor-team/js-sdk";
import { useCallback, useRef, type ReactNode } from "react";

import { NanoBananaExample } from "@/components/nano-banana-example";
import { OrbisControls } from "@/components/orbis-controls";
import { OrbisPlayer } from "@/components/orbis-player";
import { useOrbisSession } from "@/hooks/use-orbis-session";
import { ORBIS_MODELS, ORBIS_TRACKS, requestReactorJwt, type OrbisModel } from "@/lib/orbis";

type OrbisDemoProps = {
  model?: OrbisModel;
  render?: (session: ReturnType<typeof useOrbisSession>) => ReactNode;
};

export function OrbisDemo({ model = "stable", render }: OrbisDemoProps = {}) {
  return <ModelSession key={model} model={model} render={render} />;
}

function ModelSession({ model, render }: OrbisDemoProps & { model: OrbisModel }) {
  const jwtPromise = useRef<Promise<string> | null>(null);
  const currentJwt = useRef<string | null>(null);
  const getJwt = useCallback(async () => {
    const pending = (jwtPromise.current ??= requestReactorJwt(model));
    try {
      const jwt = await pending;
      currentJwt.current = jwt;
      return jwt;
    } catch (error) {
      // Do not permanently cache a failed token request.
      if (jwtPromise.current === pending) jwtPromise.current = null;
      throw error;
    }
  }, [model]);
  const getCurrentJwt = useCallback(() => currentJwt.current, []);
  const clearJwt = useCallback(() => {
    jwtPromise.current = null;
    currentJwt.current = null;
  }, []);

  return (
    <section className={render ? undefined : "demo-shell"}>
      <ReactorProvider
        apiUrl="https://api.reactor.inc"
        modelName={ORBIS_MODELS[model]}
        modelTracks={[...ORBIS_TRACKS]}
        connectOptions={{ autoConnect: false }}
        jwtToken={getJwt}
      >
        <OrbisSession
          clearJwt={clearJwt}
          getCurrentJwt={getCurrentJwt}
          model={model}
          render={render}
        />
      </ReactorProvider>
    </section>
  );
}

function OrbisSession({
  clearJwt,
  getCurrentJwt,
  model,
  render,
}: {
  clearJwt: () => void;
  getCurrentJwt: () => string | null;
  model: OrbisModel;
  render?: (session: ReturnType<typeof useOrbisSession>) => ReactNode;
}) {
  const session = useOrbisSession(clearJwt, getCurrentJwt, model);

  if (render) return render(session);

  return (
    <>
      <div className="session-grid">
        <OrbisPlayer
          connected={session.connected}
          muted={session.muted}
          runStarted={session.runStarted}
          status={session.status}
        />
        <OrbisControls session={session} />
      </div>

      <NanoBananaExample
        disabled={
          !session.connected || session.runStarted || session.controlsBusy
        }
        onActivityChange={session.setNanoBusy}
        onReady={session.startFromNanoOutput}
      />
    </>
  );
}
