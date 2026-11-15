"use client";

import { ReactorView } from "@reactor-team/js-sdk";
import { useEffect, useRef } from "react";

type OrbisPlayerProps = {
  connected: boolean;
  muted: boolean;
  runStarted: boolean;
  status: string;
  onSize?: (size: { width: number; height: number }) => void;
  onFirstFrame?: () => void;
  showStatus?: boolean;
};

export function OrbisPlayer({
  connected,
  muted,
  runStarted,
  status,
  onSize,
  onFirstFrame,
  showStatus = true,
}: OrbisPlayerProps) {
  const player = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = player.current;
    if (!element || !runStarted) return;
    let firstFrame = false;
    const report = (event: Event) => {
      if (event.target instanceof HTMLVideoElement && event.target.videoWidth) {
        const video = event.target;
        onSize?.({ width: video.videoWidth, height: video.videoHeight });
        if (!firstFrame && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          firstFrame = true;
          onFirstFrame?.();
        }
      }
    };
    const events = ["loadeddata", "playing", "resize"];
    events.forEach((event) => element.addEventListener(event, report, true));
    return () => events.forEach((event) => element.removeEventListener(event, report, true));
  }, [onSize, onFirstFrame, runStarted]);
  return (
    <div className="player" ref={player}>
      {runStarted ? (
        <ReactorView
          track="main_video"
          audioTrack="main_audio"
          muted={muted}
          videoObjectFit="contain"
        />
      ) : (
        <div className="player-placeholder">
          {connected ? "Configure and start a run" : "Connect to Orbis"}
        </div>
      )}
      {showStatus && <span className={`status status-${status}`}>{status}</span>}
    </div>
  );
}
