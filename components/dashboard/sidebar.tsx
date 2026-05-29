"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface QuotaChip {
  icon: string;
  used: number;
  limit: number;
}

interface NavItem {
  href: string;
  label: string;
}

export function Sidebar({
  nav,
  quotas,
  authLabel,
  versionString,
}: {
  nav: NavItem[];
  quotas: QuotaChip[];
  authLabel: string;
  versionString: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar al navegar. Comparamos contra ref previa para no llamar setState
  // si no cambió (evita warning de "set-state-in-effect").
  const prevPath = useRef<string | null>(null);
  useEffect(() => {
    if (prevPath.current !== null && prevPath.current !== pathname) {
      setOpen(false);
    }
    prevPath.current = pathname;
  }, [pathname]);

  // Bloquear scroll del body cuando el drawer está abierto en mobile.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Top bar mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-[oklch(96%_0.005_80)]/95 px-4 py-3 backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/tronador-mark.jpeg"
            alt=""
            width={28}
            height={28}
            className="rounded-sm"
          />
          <span className="font-mono text-xs font-semibold tracking-[0.18em]">
            TRONADOR
          </span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          <Burger open={open} />
        </button>
      </header>

      {/* Overlay mobile */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      {/* Sidebar — desktop sticky, mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-[oklch(96%_0.005_80)] px-4 py-6 transition-transform duration-200 ease-out md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Link href="/" className="mb-8 block">
          <Image
            src="/brand/tronador-wordmark.jpeg"
            alt="Tronador"
            width={180}
            height={180}
            priority
            className="h-auto w-full"
          />
        </Link>
        <nav className="flex flex-col gap-0.5 font-mono text-sm">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-2 py-1.5 transition-colors ${
                  active
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                ▸ {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 pt-6 text-xs text-zinc-400">
          {quotas.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px]">
              🔋
              {quotas.map(({ icon, used, limit }) => (
                <span key={icon}>
                  {icon} {used}/{limit}
                </span>
              ))}
            </div>
          )}
          <div>{authLabel}</div>
          <div className="font-mono text-[10px] text-zinc-500">
            {versionString}
          </div>
        </div>
      </aside>
    </>
  );
}

function Burger({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="transition-transform"
    >
      {open ? (
        <>
          <line
            x1="3"
            y1="3"
            x2="15"
            y2="15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="3"
            y1="15"
            x2="15"
            y2="3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <line
            x1="3"
            y1="5"
            x2="15"
            y2="5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="3"
            y1="9"
            x2="15"
            y2="9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <line
            x1="3"
            y1="13"
            x2="15"
            y2="13"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
