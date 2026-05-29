"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface NavItem {
  href: string;
  label: string;
}

interface UserInfo {
  name: string | null;
  email: string | null;
  image: string | null;
}

export function Sidebar({
  nav,
  user,
  versionString,
  signOutAction,
}: {
  nav: NavItem[];
  user: UserInfo | null;
  versionString: string;
  signOutAction: () => Promise<void>;
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

      {/* Sidebar — desktop sticky, mobile drawer.
          Layout en 3 zonas:
            · brand fija arriba
            · nav scrollea independiente (overflow-y-auto)
            · user pill + version fijas abajo (mt-auto + shrink-0)
          La aside es md:sticky → preservada por App Router entre navegaciones,
          su scroll interno no se pierde al cambiar de pantalla. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-[oklch(96%_0.005_80)] transition-transform duration-200 ease-out md:sticky md:top-0 md:h-screen md:w-56 md:translate-x-0 dark:border-zinc-800 dark:bg-zinc-950 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <Link href="/" className="block shrink-0 px-4 pb-4 pt-6">
          <Image
            src="/brand/tronador-wordmark.jpeg"
            alt="Tronador"
            width={180}
            height={180}
            priority
            className="h-auto w-full"
          />
        </Link>
        <nav className="flex-1 overflow-y-auto px-4 font-mono text-sm">
          <ul className="flex flex-col gap-0.5">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/" && pathname?.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`block rounded px-2 py-1.5 transition-colors ${
                      active
                        ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900"
                    }`}
                  >
                    ▸ {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="shrink-0 space-y-3 border-t border-zinc-200 bg-[oklch(96%_0.005_80)] px-4 py-4 dark:border-zinc-800 dark:bg-zinc-950">
          <UserPill user={user} signOutAction={signOutAction} />
          <div className="font-mono text-[10px] text-zinc-500">
            {versionString}
          </div>
        </div>
      </aside>
    </>
  );
}

function UserPill({
  user,
  signOutAction,
}: {
  user: UserInfo | null;
  signOutAction: () => Promise<void>;
}) {
  if (!user) {
    return (
      <div className="rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-700">
        dev (sin login)
      </div>
    );
  }
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((s) => s[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-1 pr-1.5 dark:border-zinc-800 dark:bg-zinc-950">
      {user.image ? (
        <Image
          src={user.image}
          alt={user.name ?? user.email ?? ""}
          width={28}
          height={28}
          className="h-7 w-7 rounded-full"
          unoptimized
        />
      ) : (
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 font-mono text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {initials}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-medium leading-tight text-zinc-800 dark:text-zinc-100">
          {user.name ?? "—"}
        </div>
        <div className="truncate text-[10px] leading-tight text-zinc-400">
          {user.email}
        </div>
      </div>
      <form action={signOutAction}>
        <button
          type="submit"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
        >
          <SignOutIcon />
        </button>
      </form>
    </div>
  );
}

function SignOutIcon() {
  return (
    <svg
      viewBox="0 0 18 18"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M7 3.5H4.5A1.5 1.5 0 0 0 3 5v8a1.5 1.5 0 0 0 1.5 1.5H7" />
      <path d="M11 5.5L14.5 9 11 12.5" />
      <path d="M14.5 9H7.5" />
    </svg>
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
