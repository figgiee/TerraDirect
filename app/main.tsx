import { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import "./basin.css";
import "./stage.css";

import.meta.glob("./stage-fonts.local.css", { eager: true });

const AlpineLab = lazy(async () => {
  const { AlpineLab } = await import("@/components/alpine-lab");
  return { default: AlpineLab };
});
const Starter = lazy(() => import("./starter"));
const OrbisStage = lazy(() => import("@/components/orbis-stage"));
const isStarter = /^\/starter\/?$/.test(window.location.pathname);
const isSetup = /^\/setup\/?$/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <Suspense fallback={<main role="status">Loading viewer…</main>}>
    {isStarter ? <Starter /> : isSetup ? <AlpineLab /> : <OrbisStage />}
  </Suspense>,
);
