"use client";

import { useEffect, useRef, useState } from "react";

// Precarga / intro de la landing en mobile: reproduce una vez el video de
// marca a pantalla completa y revela el sitio. Solo mobile, una vez por sesión,
// y respeta prefers-reduced-motion (lo saltea). Tap, "Saltar" o el fin del
// video la cierran; un timeout de seguridad la cierra si "ended" nunca dispara.
const SEEN_KEY = "tronador-splash-seen";
const SAFETY_MS = 12000;

function shouldShow() {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
  } catch {
    // sessionStorage bloqueado (modo privado): mostrar igual, sin persistir.
  }
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return mobile && !reduced;
}

export function MobileSplash() {
  const [show, setShow] = useState(false);
  const [closing, setClosing] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    // rAF: decidir fuera del cuerpo del effect (evita setState síncrono).
    const raf = requestAnimationFrame(() => {
      if (!shouldShow()) return;
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* sin persistencia en modo privado */
      }
      setShow(true);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(dismiss, SAFETY_MS);
    return () => clearTimeout(t);
  }, [show]);

  function dismiss() {
    if (closedRef.current) return;
    closedRef.current = true;
    setClosing(true);
    setTimeout(() => setShow(false), 320);
  }

  if (!show) return null;

  return (
    <div
      role="presentation"
      onClick={dismiss}
      className={`fixed inset-0 z-[60] flex items-center justify-center bg-[oklch(93%_0.012_80)] transition-opacity duration-300 ease-out md:hidden ${
        closing ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        className="h-full w-full object-cover"
        src="/brand/splash.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={dismiss}
        onError={dismiss}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
        className="absolute bottom-6 right-6 rounded-full bg-black/55 px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-white/90"
      >
        Saltar
      </button>
    </div>
  );
}
