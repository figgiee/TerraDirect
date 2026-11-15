"use client";

import { useReactor, useReactorMessage } from "@reactor-team/js-sdk";
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_ORBIS_RESOLUTION,
  DOCUMENTED_RESOLUTIONS,
  type OrbisMessage,
  type OrbisModel,
  unwrapOrbisMessage,
} from "@/lib/orbis";

export function useOrbisSession(
  clearJwt: () => void,
  getCurrentJwt: () => string | null,
  model: OrbisModel,
) {
  const { status, sessionId, connect, disconnect, sendCommand, uploadFile } =
    useReactor((state) => ({
      status: state.status,
      sessionId: state.sessionId,
      connect: state.connect,
      disconnect: state.disconnect,
      sendCommand: state.sendCommand,
      uploadFile: state.uploadFile,
    }));

  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [resolutionPreference, setResolution] = useState(DEFAULT_ORBIS_RESOLUTION);
  const [availableResolutions, setAvailableResolutions] = useState<string[]>(
    DOCUMENTED_RESOLUTIONS,
  );
  const selectAvailableResolution = (tiers: string[]) =>
    tiers.find((tier) => tier.toLowerCase() === resolutionPreference.toLowerCase()) ?? "";
  const resolution = selectAvailableResolution(availableResolutions);
  const [muted, setMuted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nanoBusy, setNanoBusy] = useState(false);
  const [runStarted, setRunStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [imageStatus, setImageStatus] = useState("");
  const [error, setError] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [chunks, setChunks] = useState(0);
  const [activity, setActivity] = useState(0);
  const [sessionNotice, setSessionNotice] = useState("");
  const [generation, setGeneration] = useState<OrbisMessage | null>(null);
  const [delivered, setDelivered] = useState<string | null>(null);
  const [liveResolutionSwitching, setLiveResolutionSwitching] = useState(false);

  const inFlight = useRef(false);
  const previousStatus = useRef(status);
  const disconnecting = useRef(false);
  const conditionsReadyResolver = useRef<(() => void) | null>(null);
  const imageReadyResolver = useRef<(() => void) | null>(null);
  const expectsImageForRun = useRef(false);
  const startedResolver = useRef<(() => void) | null>(null);
  const offeredResolutions = useRef(DOCUMENTED_RESOLUTIONS);

  const connected = status === "ready";
  const controlsBusy = busy || nanoBusy;

  useEffect(() => {
    if (
      status === "disconnected" &&
      previousStatus.current !== "disconnected"
    ) {
      setRunStarted(false);
      setPaused(false);
      setChunks(0);
      setImageStatus("");
      setGeneration(null);
      setDelivered(null);
      setLiveResolutionSwitching(false);
      clearJwt();
      offeredResolutions.current = DOCUMENTED_RESOLUTIONS;
      setAvailableResolutions(DOCUMENTED_RESOLUTIONS);
    }
    previousStatus.current = status;
  }, [status, clearJwt]);

  useEffect(() => {
    const handlePageHide = (event: PageTransitionEvent) => {
      // A page entering the back-forward cache is suspended, not closed.
      if (event.persisted || !sessionId) return;

      const jwt = getCurrentJwt();
      if (!jwt) return;

      // keepalive asks the browser to finish uploading this small request even
      // after the document starts unloading. The server then terminates only
      // the session owned by this session-scoped JWT.
      void fetch("/api/session-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, jwt }),
        keepalive: true,
      }).catch(() => {
        // The page is leaving, so there is nowhere useful to surface failure.
      });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [getCurrentJwt, sessionId]);

  useEffect(() => {
    if (!import.meta.env.DEV || !sessionId) {
      return;
    }

    const jwt = getCurrentJwt();
    if (!jwt) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const register = async (attempt: number) => {
      try {
        const response = await fetch("/api/session-registry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, jwt }),
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            result?.error ?? `registry returned ${response.status}`,
          );
        }
      } catch (caught) {
        if (cancelled) return;
        if (attempt < 5) {
          retryTimer = setTimeout(
            () => void register(attempt + 1),
            attempt * 1_000,
          );
          return;
        }
        setError(
          `Could not register Reactor session for development cleanup: ${
            caught instanceof Error ? caught.message : String(caught)
          }`,
        );
      }
    };

    void register(1);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [getCurrentJwt, sessionId]);

  const runAction = async (action: () => Promise<unknown>) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setActivity((value) => value + 1);
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const updateRunState = (message: OrbisMessage) => {
    if (message.type === "state") {
      if (typeof message.live_resolution_switching === "boolean") {
        setLiveResolutionSwitching(message.live_resolution_switching);
      }
      if (typeof message.started === "boolean") setRunStarted(message.started);
      if (typeof message.paused === "boolean") setPaused(message.paused);
      if (message.has_image === false && !message.started) setImageStatus("");
    } else if (message.type === "generation_started") {
      setGeneration(message);
      setRunStarted(true);
      setPaused(false);
      if (message.image_conditioned === true) {
        setImageStatus("Orbis started from this image");
      } else if (
        message.image_conditioned === false &&
        expectsImageForRun.current
      ) {
        setImageStatus("Orbis started without image conditioning");
        setError("Orbis started without the uploaded image.");
      }
    } else if (message.type === "generation_paused") {
      setPaused(true);
    } else if (message.type === "generation_resumed") {
      setPaused(false);
    } else if (
      message.type === "generation_complete" ||
      message.type === "generation_reset"
    ) {
      setRunStarted(false);
      setPaused(false);
    }
  };

  useReactorMessage((raw: unknown) => {
    const message = unwrapOrbisMessage(raw);

    if (message.type === "chunk_complete") {
      setChunks((current) => current + 1);
      if (message.delivered) setDelivered(message.delivered);
    }
    if (message.type === "conditions_ready") {
      conditionsReadyResolver.current?.();
      conditionsReadyResolver.current = null;
    }

    if (message.type === "state" && message.has_image === true) {
      imageReadyResolver.current?.();
      imageReadyResolver.current = null;
    }

    if (message.type === "state" && message.available_resolutions) {
      offeredResolutions.current = message.available_resolutions;
      setAvailableResolutions(message.available_resolutions);
    }

    if (!disconnecting.current) {
      updateRunState(message);
      if (message.type === "generation_started" || (message.type === "state" && message.started === true)) {
        startedResolver.current?.();
      }
    }

    if (message.type === "command_error") {
      setError(
        `${message.command || "command"}: ${message.reason || "rejected"}`,
      );
      if (message.command === "start") setRunStarted(false);
    }

    if (message.type) {
      setEvents((current) => [message.type!, ...current].slice(0, 8));
    }
  });

  const waitForSignal = (
    resolver: { current: (() => void) | null },
    signalName: string,
  ) => {
    let timeout: ReturnType<typeof setTimeout>;
    const promise = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => {
        resolver.current = null;
        reject(new Error(`Timed out waiting for Orbis ${signalName}.`));
      }, 15_000);
      resolver.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
    void promise.catch(() => {});
    return {
      promise,
      cancel: () => {
        clearTimeout(timeout);
        resolver.current = null;
      },
    };
  };

  // Shared by the regular form and the Nano Banana one-click example.
  const startGeneration = async (
    startImage: File | null,
    runPrompt: string,
    passthrough = false,
  ) => {
    if (!runPrompt.trim()) throw new Error("Enter a prompt before starting.");
    expectsImageForRun.current = Boolean(startImage);
    setChunks(0);
    setGeneration(null);
    setDelivered(null);

    if (startImage) {
      const uploaded = await uploadFile(startImage, { name: startImage.name });
      const imageReady = waitForSignal(imageReadyResolver, "state.has_image");
      const rawReply = await sendCommand("set_image", { image: uploaded });
      if (!rawReply) {
        imageReady.cancel();
        throw new Error("Orbis did not accept the uploaded start image.");
      }

      const reply = unwrapOrbisMessage(rawReply);
      if (reply.type === "command_error") {
        imageReady.cancel();
        throw new Error(`set_image: ${reply.reason || "rejected"}`);
      }
      if (reply.type !== "image_accepted") {
        imageReady.cancel();
        throw new Error(
          `Expected image_accepted from Orbis, received ${reply.type || "an unknown reply"}.`,
        );
      }

      await imageReady.promise;

      const dimensions =
        reply.width && reply.height ? ` (${reply.width}×${reply.height})` : "";
      setImageStatus(`Orbis accepted image${dimensions}`);
      setEvents((current) => ["image_accepted", ...current].slice(0, 8));
    }

    const deliveryTier = selectAvailableResolution(offeredResolutions.current);
    if (deliveryTier) {
      const reply = unwrapOrbisMessage(
        await sendCommand("set_resolution", { resolution: deliveryTier }),
      );
      if (reply?.type !== "resolution_accepted") {
        throw new Error(reply?.reason || "Orbis did not accept the delivery resolution.");
      }
    }

    const conditionsReady = waitForSignal(
      conditionsReadyResolver,
      "conditions_ready",
    );
    const promptReply = await sendCommand("set_prompt", {
      prompt: runPrompt.trim(),
      ...(passthrough ? { passthrough: true } : {}),
    });
    if (!promptReply) {
      conditionsReady.cancel();
      throw new Error("Orbis did not accept the prompt.");
    }

    const promptMessage = unwrapOrbisMessage(promptReply);
    if (promptMessage.type !== "prompt_accepted") {
      conditionsReady.cancel();
      throw new Error(`set_prompt: ${promptMessage.reason || "rejected"}`);
    }

    await conditionsReady.promise;
    setEvents((current) => ["conditions_ready", ...current].slice(0, 8));
    const started = waitForSignal(startedResolver, "generation_started");
    // Some deployments acknowledge start without a response body.
    const reply = await sendCommand("start", {});
    const message = reply ? unwrapOrbisMessage(reply) : undefined;
    if (message?.type === "command_error") {
      started.cancel();
      throw new Error(message.reason || "Orbis rejected the start command.");
    }
    if (message?.type === "generation_started") {
      started.cancel();
      updateRunState(message);
    } else {
      await started.promise;
    }
  };

  const connectSession = () => {
    setSessionNotice("");
    return runAction(async () => {
      try {
        await connect();
      } catch (error) {
        clearJwt();
        throw error;
      }
    });
  };

  const connectAndStart = (file: File, direction: string, passthrough = false) => {
    setSessionNotice("");
    return runAction(async () => {
      if (!connected) {
        try {
          await connect();
        } catch (error) {
          clearJwt();
          throw error;
        }
      }
      await startGeneration(file, direction, passthrough);
    });
  };

  const changeResolution = (tier: string) => runAction(async () => {
    if (!liveResolutionSwitching || model !== "dynamic" || !connected || !runStarted || !offeredResolutions.current.includes(tier)) {
      throw new Error("This delivery resolution is unavailable during this stream.");
    }
    const reply = unwrapOrbisMessage(await sendCommand("set_resolution", { resolution: tier }));
    if (reply?.type !== "resolution_accepted") {
      throw new Error(reply?.reason || "Orbis did not accept the delivery resolution.");
    }
    setResolution(tier);
  });

  const selectImage = (nextImage: File | null) => {
    setImage(nextImage);
    setImageStatus("");
  };

  const startRun = () => runAction(() => startGeneration(image, prompt));

  const startFromNanoOutput = async (
    editedImage: File,
    groundedPrompt: string,
  ) => {
    setImage(editedImage);
    setPrompt(groundedPrompt);
    await runAction(() => startGeneration(editedImage, groundedPrompt));
  };

  const steer = (direction = prompt, passthrough = false) =>
    runAction(async () => {
      if (!direction.trim()) throw new Error("Enter a prompt before steering.");
      const reply = unwrapOrbisMessage(await sendCommand("set_prompt", {
        prompt: direction.trim(),
        ...(passthrough ? { passthrough: true } : {}),
      }));
      if (reply?.type !== "prompt_accepted") throw new Error(reply?.reason || "Orbis did not accept the steering prompt.");
    });

  const disconnectSession = async (idle = false) => {
    if (disconnecting.current || inFlight.current) return;
    disconnecting.current = true;
    setRunStarted(false);
    setPaused(false);

    // Remove ReactorView before closing the WebRTC tracks it is playing.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    try {
      const disconnected = await runAction(() => disconnect());
      if (disconnected) {
        if (import.meta.env.DEV && sessionId) {
          try {
            await fetch("/api/session-registry", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
          } catch {
            // A stale registry entry is harmless: the next sweep gets a 404
            // from Reactor and removes it.
          }
        }
        clearJwt();
        if (idle) setSessionNotice("Orbis disconnected after inactivity.");
      }
    } finally {
      disconnecting.current = false;
    }
  };

  useEffect(() => {
    if (!connected || controlsBusy) return;
    const timer = window.setTimeout(() => void disconnectSession(true), runStarted ? 75_000 : 35_000);
    return () => window.clearTimeout(timer);
  }, [activity, connected, controlsBusy, runStarted]);

  return {
    status,
    connected,
    controlsBusy,
    runStarted,
    paused,
    muted,
    prompt,
    image,
    imageStatus,
    generation,
    delivered,
    liveResolutionSwitching,
    resolution,
    availableResolutions,
    error,
    sessionNotice,
    events,
    chunks,
    startFromImage: (file: File | null, direction: string, passthrough = false) =>
      runAction(() => startGeneration(file, direction, passthrough)),
    connectSession,
    connectAndStart,
    changeResolution,
    disconnectSession: () => disconnectSession(),
    noteActivity: () => setActivity((value) => value + 1),
    toggleMuted: () => {
      setActivity((value) => value + 1);
      setMuted((current) => !current);
    },
    setPrompt,
    selectImage,
    setResolution,
    startRun,
    startFromNanoOutput,
    setNanoBusy,
    steer,
    pause: () => runAction(() => sendCommand("pause", {})),
    resume: () => runAction(() => sendCommand("resume", {})),
    reset: () => runAction(() => sendCommand("reset", {})),
  };
}

export type OrbisSession = ReturnType<typeof useOrbisSession>;
