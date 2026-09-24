"use client";

import { useEffect, useState } from "react";

// Instalar la app. Android/Chrome: se captura beforeinstallprompt y se
// muestra un botón propio. iOS/Safari no tiene ese evento: instrucciones
// ilustradas de Compartir → Agregar a inicio. Sin instalar, en iPhone no hay
// notificaciones, así que esto no es decorativo. Si ya está instalada, nada.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "playus-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
  return ios && safari;
}

export function InstallCard({ dismissable = true }: { dismissable?: boolean }) {
  const [mode, setMode] = useState<"hidden" | "android" | "ios" | "installed">("hidden");
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setMode("installed");
      return;
    }
    let dismissed = false;
    try {
      dismissed = dismissable && localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* sin storage */
    }
    if (dismissed) return;

    if (isIosSafari()) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setMode("installed"));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [dismissable]);

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") setMode("installed");
    setPrompt(null);
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* sin storage */
    }
    setMode("hidden");
  }

  if (mode === "hidden") return null;
  if (mode === "installed") {
    return dismissable ? null : <p className="eyebrow">la app ya está instalada en este teléfono.</p>;
  }

  return (
    <div className="panel" data-testid="install-card">
      <p className="font-extrabold">instalá playus en el teléfono</p>
      {mode === "android" ? (
        <>
          <p className="eyebrow">queda con ícono propio, abre a pantalla completa y puede avisarte.</p>
          <button type="button" onClick={install} className="btn-primary-sm">
            instalar la app
          </button>
        </>
      ) : (
        <ol className="flex flex-col gap-3 text-sm">
          <li className="flex items-center gap-3">
            <ShareIcon />
            <span>
              tocá <span className="font-bold">compartir</span> abajo en Safari
            </span>
          </li>
          <li className="flex items-center gap-3">
            <PlusIcon />
            <span>
              elegí <span className="font-bold">agregar a inicio</span>
            </span>
          </li>
          <li className="flex items-center gap-3">
            <BellIcon />
            <span>abrila desde el ícono: solo así puede avisarte</span>
          </li>
        </ol>
      )}
      {dismissable ? (
        <button type="button" onClick={dismiss} className="self-start text-sm text-tinta-suave underline">
          ahora no
        </button>
      ) : null}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5BC0BE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 11v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5BC0BE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5BC0BE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 21h4" />
    </svg>
  );
}
