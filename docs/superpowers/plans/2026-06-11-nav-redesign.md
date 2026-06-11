# Rediseño de navegación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development donde aplique. Steps con checkbox (`- [ ]`).

**Goal:** Sidebar con secciones colapsables + modo riel de íconos (ocultable), y pop-out de páginas clave a ventana sin chrome para multi-monitor.

**Architecture:** Estado del sidebar (`expanded`|`rail`) y secciones abiertas persistidos en `localStorage`, hidratados post-montaje. Pop-out vía `?solo=1` leído por un wrapper client `<Chrome>` (los layouts no reciben searchParams). Íconos con `lucide-react`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind, lucide-react, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-nav-redesign-design.md`

Comando de tests: `npx vitest run <ruta>`. Branch: `feat/nav-redesign`.

---

## Task 1: Dependencia lucide-react

- [ ] **Step 1:** `npm install lucide-react`
- [ ] **Step 2:** Verificar que quedó en `package.json` dependencies.
- [ ] **Step 3:** Commit: `git add package.json package-lock.json && git commit -m "chore: agrega lucide-react para íconos de nav"`

---

## Task 2: `lib/nav.ts` — tipos + `activeSection` (TDD)

**Files:** Create `lib/nav.ts`, `tests/nav.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// tests/nav.test.ts
import { describe, it, expect } from "vitest";
import { activeSection, type NavGroup } from "@/lib/nav";

const NAV: NavGroup[] = [
  { section: "Operación", items: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/campanas", label: "Campañas", icon: "Megaphone" },
    { href: "/campanas/flows", label: "Flows", icon: "Workflow" },
  ] },
  { section: "Investigación", items: [
    { href: "/respuestas", label: "Respuestas", icon: "MessageSquare" },
  ] },
];

describe("activeSection", () => {
  it("match exacto", () => expect(activeSection("/dashboard", NAV)).toBe("Operación"));
  it("match por subruta (startsWith)", () => expect(activeSection("/campanas/flows", NAV)).toBe("Operación"));
  it("otra sección", () => expect(activeSection("/respuestas", NAV)).toBe("Investigación"));
  it("ruta desconocida → null", () => expect(activeSection("/nope", NAV)).toBeNull());
});
```

- [ ] **Step 2:** `npx vitest run tests/nav.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

```ts
// lib/nav.ts
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // nombre de ícono lucide (se resuelve en el cliente)
}
export interface NavGroup {
  section: string;
  items: NavItem[];
}
export type { LucideIcon };

// Devuelve el nombre de la sección que contiene la ruta activa, o null.
// Prioriza match exacto; si no, el item más específico por startsWith.
export function activeSection(pathname: string, nav: NavGroup[]): string | null {
  let best: { section: string; len: number } | null = null;
  for (const g of nav) {
    for (const it of g.items) {
      const exact = pathname === it.href;
      const sub = it.href !== "/" && pathname.startsWith(it.href + "/");
      if (exact) return g.section;
      if (sub && (!best || it.href.length > best.len)) best = { section: g.section, len: it.href.length };
    }
  }
  return best?.section ?? null;
}
```

- [ ] **Step 4:** `npx vitest run tests/nav.test.ts` → PASS.
- [ ] **Step 5:** Commit: `git commit -am "feat(nav): lib/nav.ts con activeSection (helper testeable)"`

---

## Task 3: `NAV` con íconos en `layout.tsx`

**Files:** Modify `app/(dashboard)/layout.tsx`

- [ ] **Step 1:** Importar el tipo y mover `NAV` a usar `icon`. Reemplazar la const `NAV` por (íconos lucide existentes):

```ts
import type { NavGroup } from "@/lib/nav";

const NAV: NavGroup[] = [
  { section: "Operación", items: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/contactos", label: "Contactos", icon: "Users" },
    { href: "/segmentos", label: "Segmentos", icon: "PieChart" },
    { href: "/campanas", label: "Campañas", icon: "Megaphone" },
    { href: "/campanas/flows", label: "Flows", icon: "Workflow" },
  ] },
  { section: "Investigación", items: [
    { href: "/escucha", label: "Escucha", icon: "Ear" },
    { href: "/encuestas", label: "Encuestas", icon: "ClipboardList" },
    { href: "/respuestas", label: "Respuestas", icon: "MessageSquare" },
  ] },
  { section: "Contenido", items: [
    { href: "/publicaciones", label: "Estudio", icon: "PenTool" },
    { href: "/templates", label: "Plantillas", icon: "LayoutTemplate" },
    { href: "/difusion", label: "Difusión", icon: "Send" },
  ] },
  { section: "Sistema", items: [
    { href: "/mail", label: "Mail", icon: "Mail" },
    { href: "/conectores", label: "Conectores", icon: "Plug" },
    { href: "/proyectos", label: "Proyecto", icon: "FolderKanban" },
    { href: "/auditoria", label: "Auditoría", icon: "ScrollText" },
  ] },
];
```

Borrar las interfaces `NavItem`/`NavGroup` duplicadas si estaban inline.

- [ ] **Step 2:** Envolver el render con `<Chrome>` (ver Task 5). Por ahora dejar el `<Sidebar>`/`<main>` como están; se ajusta en Task 5.
- [ ] **Step 3:** `npx tsc --noEmit` → sin errores (el Sidebar todavía no usa `icon`, ok).
- [ ] **Step 4:** Commit: `git commit -am "feat(nav): NAV con íconos lucide por ítem"`

---

## Task 4: Reescritura del `Sidebar` — secciones colapsables + riel + persistencia

**Files:** Rewrite `components/dashboard/sidebar.tsx`

- [ ] **Step 1:** Reescribir el componente. Puntos clave:
  - Resolver íconos lucide por nombre: `import * as Icons from "lucide-react"` y `const Icon = (Icons as Record<string, LucideIcon>)[item.icon] ?? Icons.Circle`.
  - Estado `mode: "expanded" | "rail"` (default `"expanded"`) y `sections: Record<string, boolean>`.
  - Hidratar de `localStorage` (`nav:mode`, `nav:sections`) en `useEffect` post-montaje (no en el initializer) y persistir en otro `useEffect` — mismo patrón que `components/publicaciones/ad-studio.tsx` (BRIEF_STORAGE_KEY).
  - Default de secciones: abierta solo la de `activeSection(pathname, nav)`, salvo override en `localStorage`.
  - Ancho: `md:w-56` en expanded, `md:w-14` en rail. Botón ≡ (lucide `PanelLeftClose`/`PanelLeftOpen`) alterna `mode` (persistido).
  - **Expanded:** header de sección = `<button>` con label + chevron (`ChevronDown` abierta / `ChevronRight` cerrada) que togglea `sections[section]`. Ítems con `<Icon size={16}/>` + label + dot activo (mantener acento índigo en activo).
  - **Rail:** sin headers; íconos centrados, `aria-label={label}` y `title={label}` (tooltip nativo) + tooltip visual opcional; separador fino (`border-t`) entre grupos. Ítem activo con el fondo activo.
  - Mobile drawer: igual que hoy (translate-x); en mobile siempre expanded (el modo riel es solo `md:`). Conservar topbar mobile, overlay, cierre al navegar y lock de scroll.
  - El toggle ≡ se muestra solo en `md:` (desktop).

- [ ] **Step 2:** `npx tsc --noEmit` → sin errores.
- [ ] **Step 3: Verificación manual** `npm run dev`: en desktop, secciones abren/cierran y persisten (reload); ≡ pasa a riel (solo íconos, tooltip al hover) y persiste; activo resaltado en ambos modos; mobile sigue andando.
- [ ] **Step 4:** Commit: `git commit -am "feat(nav): sidebar con secciones colapsables + modo riel + persistencia"`

---

## Task 5: `<Chrome>` — pop-out sin chrome vía `?solo=1`

**Files:** Create `components/dashboard/chrome.tsx`; Modify `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Crear el wrapper client**

```tsx
// components/dashboard/chrome.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

function ChromeInner({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const solo = useSearchParams().get("solo") === "1";
  if (solo) return <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>;
  return (
    <>
      {sidebar}
      <main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>
    </>
  );
}

// useSearchParams requiere Suspense en App Router.
export function Chrome({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <Suspense fallback={<main className="flex-1 px-5 py-6 sm:px-8 sm:py-8">{children}</main>}>
      <ChromeInner sidebar={sidebar}>{children}</ChromeInner>
    </Suspense>
  );
}
```

- [ ] **Step 2:** En `layout.tsx`, reemplazar el `<div className="flex …"><Sidebar/><main>…</main></div>` por:

```tsx
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Chrome
        sidebar={
          <Sidebar
            nav={NAV}
            user={user}
            versionString={VERSION_STRING}
            signOutAction={cerrarSesion}
            projects={projectOptions}
            activeProjectId={active?.id ?? null}
            switchProjectAction={setActiveProject}
          />
        }
      >
        {children}
      </Chrome>
    </div>
  );
```

Importar `Chrome`. Nota: el topbar mobile vive dentro de `<Sidebar>`, así que con `solo=1` (sin sidebar) tampoco se renderiza el topbar. ✔

- [ ] **Step 3:** `npx tsc --noEmit` → sin errores.
- [ ] **Step 4: Verificación manual** abrir `/respuestas?solo=1` → sin sidebar ni topbar, contenido full-width. `/respuestas` normal sigue con sidebar.
- [ ] **Step 5:** Commit: `git commit -am "feat(nav): Chrome wrapper para pop-out sin chrome (?solo=1)"`

---

## Task 6: `<PopOutButton>` + insertar en Escucha/Respuestas/Mail

**Files:** Create `components/dashboard/pop-out-button.tsx`; Modify las 3 páginas

- [ ] **Step 1: Crear el botón**

```tsx
// components/dashboard/pop-out-button.tsx
"use client";

import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

// Abre la página actual sin chrome (?solo=1) en una ventana nueva, para
// arrastrar a un segundo monitor.
export function PopOutButton({ label = "Abrir en ventana" }: { label?: string }) {
  const pathname = usePathname();
  return (
    <button
      type="button"
      onClick={() => window.open(`${pathname}?solo=1`, "_blank", "popup=yes,width=1100,height=820")}
      className={buttonClass("secondary", "sm")}
      title={label}
    >
      <ExternalLink size={14} className="mr-1.5 inline" />
      Ventana
    </button>
  );
}
```

- [ ] **Step 2:** En `app/(dashboard)/escucha/page.tsx`, `respuestas/page.tsx`, `mail/page.tsx`: importar `PopOutButton` y pasarlo en el `action` del `<PageHeader>`. Si la página ya usa `action`, envolver ambos en un `<div className="flex gap-2">`. Estas páginas son server components; `PopOutButton` es client → se puede usar como child directamente.

Ejemplo (respuestas, que probablemente no tiene action):
```tsx
import { PopOutButton } from "@/components/dashboard/pop-out-button";
// …
<PageHeader eyebrow="…" title="…" subtitle={…} action={<PopOutButton />} />
```

Para escucha/mail que ya tienen `action`, combinar:
```tsx
action={<div className="flex items-center gap-2"><PopOutButton />{/* acción existente */}</div>}
```

- [ ] **Step 3:** `npx tsc --noEmit` → sin errores.
- [ ] **Step 4: Verificación manual** en Escucha/Respuestas/Mail aparece botón "Ventana" → abre popup sin chrome.
- [ ] **Step 5:** Commit: `git commit -am "feat(nav): botón pop-out en Escucha/Respuestas/Mail"`

---

## Task 7: Suite + lint final

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit && npm run lint` → todo verde.
- [ ] **Step 2:** Si algo falla, arreglar y re-commit.

---

## Self-review

- Cobertura del spec: secciones colapsables múltiples + persistencia (Task 4) · modo riel ocultable con íconos+tooltip (Tasks 1,3,4) · pop-out multi-monitor (Tasks 5,6) · íconos lucide (Task 1,3) · solo páginas clave (Task 6) · helper testeado (Task 2). ✔
- Sin placeholders: código real en cada step (UI con verificación manual donde no aplica unit test).
- Tipos consistentes: `NavGroup`/`NavItem`/`activeSection` en `lib/nav.ts`, consumidos en layout + sidebar.
