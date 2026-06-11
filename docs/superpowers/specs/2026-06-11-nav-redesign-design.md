# Rediseño de navegación — diseño

**Fecha:** 2026-06-11
**Estado:** aprobado en brainstorming.

## Problema

El sidebar actual (`components/dashboard/sidebar.tsx`) en desktop:
1. Tiene 4 secciones siempre abiertas (15 ítems) → la `nav` usa `overflow-y-auto` y el **scroll interno es malo** en web.
2. **No se puede ocultar** en desktop para usar toda la pantalla (solo hay drawer en mobile).
3. No hay forma de **aprovechar múltiples monitores**.

## Decisiones (brainstorming)

1. **Secciones colapsables múltiples**: cada sección se abre/cierra independiente; el estado persiste. Auto-abre la sección de la ruta activa al cargar.
2. **Ocultar = riel de íconos**: el sidebar colapsa a una franja (~56px) con solo íconos; el label aparece en tooltip al hover. Toggle alterna expandido↔riel; persiste.
3. **Multi-pantalla = pop-out a ventana nueva**: botón "Abrir en ventana" que abre la página sin chrome (`?solo=1`) para arrastrar a otro monitor. Solo en páginas clave.
4. **Íconos**: `lucide-react`.
5. **Pop-out**: solo en **Escucha, Respuestas, Mail**.

### Fuera de alcance

- Ocultar el sidebar del todo (se eligió riel, no full-hide).
- Split-pane / paneles dentro de una ventana.
- Atajos de teclado (se puede sumar después).

## Arquitectura

- **Estados del sidebar (desktop):** `expanded` (w-56, secciones colapsables) ↔ `rail` (w-14, solo íconos + tooltip). Toggle con botón ≡.
- **Persistencia** en `localStorage`: `nav:mode` (`expanded`|`rail`) y `nav:sections` (mapa `section→boolean`). Hidratación post-montaje (mismo patrón anti-mismatch SSR que `ad-studio.tsx`).
- **Pop-out (`?solo=1`):** los layouts de App Router no reciben `searchParams`, así que un wrapper **client** `components/dashboard/chrome.tsx` lee `useSearchParams()`; si `solo=1`, no renderiza el sidebar/topbar y deja `main` full-width.
- **Íconos:** cada ítem del `NAV` (en `layout.tsx`) gana un campo `icon` (componente lucide). El sidebar los usa en ambos modos.

### Archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `package.json` | Modificar | +`lucide-react`. |
| `lib/nav.ts` | Crear | Tipos `NavItem`/`NavGroup` + `activeSection(pathname, nav)` (helper puro, testeable). |
| `app/(dashboard)/layout.tsx` | Modificar | `NAV` con íconos; envolver con `<Chrome>`. |
| `components/dashboard/chrome.tsx` | Crear | Client: decide sidebar+topbar vs solo, según `?solo=1`. |
| `components/dashboard/sidebar.tsx` | Reescribir | Secciones colapsables + modo riel + tooltips + persistencia. |
| `components/dashboard/pop-out-button.tsx` | Crear | Botón "Abrir en ventana" (`window.open(... ?solo=1)`). |
| `app/(dashboard)/escucha/…`, `respuestas/…`, `mail/…` | Modificar | Insertar `<PopOutButton>` en el header de esas 3 páginas. |
| `tests/nav.test.ts` | Crear | Tests de `activeSection` + serialización de estado. |

## Comportamiento detallado

### Sidebar expandido
- Header de sección = `<button>` con label + chevron (`ChevronDown`/`ChevronRight`). Click alterna abierta/cerrada (persiste en `nav:sections`).
- Ítems: ícono lucide + label + dot de activo (se mantiene el acento índigo en activo).
- Al montar: si `nav:sections` no tiene entrada para una sección, default = abierta solo si contiene la ruta activa (`activeSection`), cerrada el resto.
- Botón ≡ (arriba o abajo) → pasa a `rail`.

### Sidebar riel (w-14)
- Solo íconos centrados, sin headers de sección (separador fino entre grupos).
- Hover → tooltip con el label (`title` + tooltip visual). `aria-label` siempre presente.
- Ítem activo: fondo/acento como en expandido.
- Botón ≡ → vuelve a `expanded`.

### Pop-out
- `<PopOutButton>`: `window.open(pathname + "?solo=1", "_blank", "popup=yes,width=1100,height=800")`.
- `<Chrome solo>` (cuando `?solo=1`): no renderiza `<Sidebar>` ni el topbar mobile; `main` ocupa todo. Se pueden abrir varias ventanas.

## Errores / edge cases

- **SSR/hydration:** render por defecto = `expanded` con secciones según `activeSection`; hidratar de `localStorage` en `useEffect` post-montaje (no en el initializer).
- **Accesibilidad del riel:** cada link con `aria-label`; tooltip no es la única fuente del nombre.
- **`?solo=1` en mobile:** también oculta el topbar.
- **`localStorage` no disponible:** try/catch, cae a defaults (igual que `ad-studio.tsx`).

## Testing

- `tests/nav.test.ts` (vitest): `activeSection("/respuestas", NAV)` → `"Investigación"`; ruta desconocida → `null`; match por `startsWith` para subrutas (`/campanas/flows` → `"Operación"`). Serialización/parseo del estado de secciones (round-trip).
- Resto (modos del sidebar, tooltips, pop-out): verificación manual con `npm run dev`.

## Plan

Ver `docs/superpowers/plans/2026-06-11-nav-redesign.md`.
