---
name: Tronador
description: Plataforma multicanal de relevamiento de opinión pública (app interna).
colors:
  accent-indigo: "#4f5bd5"
  ink: "#18181b"
  ink-soft: "#3f3f46"
  muted: "#71717a"
  surface: "#ffffff"
  surface-subtle: "#fafafa"
  border: "#e4e4e7"
  surface-dark: "#09090b"
  surface-dark-raised: "#18181b"
  border-dark: "#27272a"
  ok: "#059669"
  warn: "#d97706"
  danger: "#dc2626"
typography:
  display:
    fontFamily: "Geist, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Geist, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.16em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  button-accent:
    backgroundColor: "{colors.accent-indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    padding: "6px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  chip:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
---

# Design System: Tronador

## 1. Overview

**Creative North Star: "La mesa de operaciones"**

Tronador es el tablero de trabajo de un equipo de estudios de opinión. La interfaz es un instrumento, no una vitrina: densa donde el operador repite tareas, ordenada donde el dato tiene que leerse sin ambigüedad. Todo está a mano y nada compite por atención. La estética es sobria por convicción, porque el rigor se transmite con orden y neutralidad, no con decoración. Es investigación, no campaña: no hay color de partido, no hay tono de marketing.

El color trabaja en un solo registro: neutros zinc cargan el 90% de la pantalla y un único acento índigo (`oklch(52% 0.13 255)`) marca la acción o el foco. La tipografía Geist hace el grueso del trabajo de jerarquía: encabezados de sección deliberadamente chicos, cuerpo legible, datos en monoespaciada con cifras tabulares. Las superficies son tarjetas sutilmente elevadas sobre un fondo tranquilo, con bordes finos que separan sin gritar.

Rechaza explícitamente el SaaS genérico y el AI slop: nada de gradientes decorativos, grillas de cards idénticas, plantilla hero-metric, glassmorphism porque sí ni bordes laterales de color. Si una pantalla se puede mirar y decir "la hizo una IA", está mal.

**Key Characteristics:**
- Neutros zinc + un solo acento índigo (regla de una sola voz).
- Tarjetas sutilmente elevadas, bordes de 1px, modo claro y oscuro equivalentes.
- Densidad al servicio de la repetición; jerarquía por tipografía y espacio antes que por color.
- Datos en monoespaciada con `tabular-nums`.

## 2. Colors

Paleta de un solo acento sobre neutros zinc: el índigo es raro a propósito, todo lo demás es estructura.

### Primary
- **Índigo de operación** (`#4f5bd5`, canónico `oklch(52% 0.13 255)`): el único acento. Marca la acción principal de creación (Aplicar filtros, Generar, Diseñar con IA), el foco de inputs y los estados seleccionados (chips, bandas). Aparece en una fracción mínima de cada pantalla.

### Neutral
- **Tinta** (`#18181b`, zinc-900): texto principal en claro; fondo del botón primario; superficie elevada en oscuro.
- **Tinta suave** (`#3f3f46`, zinc-700): texto secundario, hover de botón primario.
- **Apagado** (`#71717a`, zinc-500): labels, metadatos, texto auxiliar.
- **Superficie** (`#ffffff`) y **Superficie sutil** (`#fafafa`, zinc-50): fondo de tarjetas y de zonas de relleno (chips, headers de tabla).
- **Borde** (`#e4e4e7`, zinc-200) / **Borde oscuro** (`#27272a`, zinc-800): separadores de 1px y contorno de tarjetas.
- **Superficie oscura** (`#09090b`, zinc-950) / **Superficie oscura elevada** (`#18181b`): fondos en modo oscuro.

### Tertiary (estados, no decorativos)
- **OK** (`#059669`, emerald-600): éxito, confirmaciones, conteos positivos.
- **Aviso** (`#d97706`, amber-600): advertencias, modo mock, datos faltantes.
- **Peligro** (`#dc2626`, red-600): destructivo y errores.

### Named Rules
**La regla de una sola voz.** El acento índigo ocupa 10% o menos de cualquier pantalla. Su rareza es lo que lo hace legible como "acá está la acción". Si hay dos índigos compitiendo, uno sobra.

**La regla sin partido.** Prohibido cualquier color que lea como identidad partidaria. La paleta es neutra porque el producto es neutral.

## 3. Typography

**Display / Body Font:** Geist (con `-apple-system, Segoe UI, Roboto, sans-serif`)
**Label/Mono Font:** Geist Mono (con `ui-monospace, SFMono-Regular, monospace`)

**Character:** Geist es una grotesca neutral y técnica: ni cálida ni fría, se corre del camino. El sistema apuesta a una jerarquía contenida (los encabezados de sección son chicos) para que la densidad no se sienta ruidosa.

### Hierarchy
- **Display** (600, 1.5rem / `text-2xl`, -0.01em): título de página (h1). Uno por pantalla.
- **Title** (600, 1.25rem / `text-xl`, -0.01em): título de detalle o ficha.
- **Section** (600, 0.875rem / `text-sm`): encabezado de sección/tarjeta. Deliberadamente del tamaño del cuerpo: jerarquía por peso, no por escala.
- **Body** (400, 0.875rem / `text-sm`, 1.5): texto general. Limitar a 65-75ch en bloques de lectura (`max-w-[60ch]` en subtítulos).
- **Label** (500, 0.625rem / `text-[10px]`, mayúsculas, 0.16em tracking): rótulos de campo y secciones menores.
- **Mono** (400, 0.6875rem / `text-[11px]`, Geist Mono, `tabular-nums`): DNIs, IDs, fechas, métricas. Cualquier número que se compare en columna va en mono tabular.

### Named Rules
**La regla de peso sobre escala.** La jerarquía se construye con peso (400 vs 600) y color (zinc-900 vs zinc-500), no inflando tamaños. Un encabezado de sección y su cuerpo pueden medir lo mismo.

**La regla de la cifra tabular.** Todo número alineable usa monoespaciada con `tabular-nums`. Las cifras nunca bailan entre filas.

## 4. Elevation

Sistema sutilmente elevado sobre un fondo tranquilo. Las superficies de contenido son tarjetas con borde de 1px (`border-zinc-200` / `dark:border-zinc-800`) y una sombra ambiental muy suave que las despega del fondo sin dramatismo. Las tablas densas y las zonas de relleno se mantienen planas (solo tono y borde) para no sumar ruido. La sombra es ambiental, no estructural: comunica "esto es una superficie", no "esto flota".

### Shadow Vocabulary
- **Reposo** (`box-shadow: 0 1px 2px oklch(0% 0 0 / 0.04)`): tarjetas y contenedores en estado normal.
- **Hover/elevado** (`box-shadow: 0 6px 20px oklch(0% 0 0 / 0.08)`): tarjetas accionables o modales al interactuar.

### Named Rules
**La regla de la sombra silenciosa.** Las sombras nunca son oscuras ni grandes. Si una sombra se nota como sombra, está mal calibrada: tiene que leerse como aire, no como caja.

## 5. Components

### Buttons
- **Shape:** esquinas suaves (4px / `rounded` en primario y secundario; 8px / `rounded-lg` en acciones con acento).
- **Primary:** fondo tinta (`zinc-900`) con texto blanco; en oscuro se invierte (`zinc-100` sobre texto oscuro). Padding `6px 16px`. Es el "guardar/confirmar" neutro.
- **Accent:** fondo índigo (`oklch(52% 0.13 255)`) con texto blanco, `rounded-lg`. Reservado a la acción generativa o de avance principal (Aplicar, Generar, Diseñar con IA).
- **Secondary / Ghost:** borde `zinc-300`, texto `zinc-700`, fondo transparente; hover `zinc-100`.
- **Danger:** fondo `red-600`, texto blanco, para acciones destructivas confirmadas.
- **Hover / Focus:** transición de color 150-200ms; foco visible con ring del acento (`ring-4 ring-[oklch(52%_0.13_255)]/12`). Spinner inline + label "…ndo" mientras está pending.

### Chips / Badges
- **Style:** píldora (`rounded-full`), fondo `zinc-100` (o tinte de estado), texto `zinc-700`, sin borde o borde 1px.
- **State:** seleccionado vira a borde + fondo índigo tenue (`has-[:checked]:border-[oklch(52%_0.13_255)]`). Puntos de estado de color (emerald/amber/red) siempre acompañados de texto, nunca color solo.

### Cards / Containers
- **Corner Style:** 8px (`rounded-lg`); 12px (`rounded-xl`) en superficies destacadas como el preview de posteo.
- **Background:** `surface` en claro, `surface-dark-raised` en oscuro.
- **Shadow Strategy:** sombra de reposo (ver Elevation); plano en tablas.
- **Border:** 1px `zinc-200` / `dark:zinc-800`.
- **Internal Padding:** `16px`-`20px` (`p-4`/`p-5`).

### Inputs / Fields
- **Style:** borde 1px `zinc-300`, fondo `surface`, `rounded-md` (6px), texto `text-sm`.
- **Focus:** borde vira al acento + ring suave (`focus-visible:ring-4 ring-[oklch(52%_0.13_255)]/12`). En oscuro el borde vira a `zinc-100`.
- **Label:** rótulo en `label` (10px, mayúsculas, tracking 0.16em) sobre el campo.
- **Error / Disabled:** estado en `FormStatus` (borde+fondo `red`/`emerald`); disabled baja opacidad y `cursor-not-allowed`.

### Navigation
- **Style:** barra lateral con ítems de texto; activo en tinta sólida, inactivos en `zinc-500` con hover `zinc-100`. Tipografía body. En móvil colapsa sobre el `<main>` (layout `flex-col md:flex-row`).

### Signature: contenedor de página
- Ancho por tipo de pantalla: densas (tablas/dashboards/estudio) `max-w-7xl`; listas/contenido `max-w-5xl/6xl`; formularios `max-w-3xl/4xl`. Centrado con `mx-auto`, padding `px-5/px-8 py-6/py-8` en el shell. Nunca dejar más de un tercio de una pantalla 1920 en blanco por capar de más.

## 6. Do's and Don'ts

### Do:
- **Do** usar un solo acento índigo (`oklch(52% 0.13 255)`) y reservarlo a la acción principal y al foco (regla de una sola voz).
- **Do** construir jerarquía con peso y color de texto antes que con tamaño.
- **Do** poner todo número alineable en Geist Mono con `tabular-nums`.
- **Do** acompañar siempre el color de estado con texto o ícono (emerald/amber/red nunca solos), por daltonismo.
- **Do** mantener foco visible (ring del acento), navegación por teclado y contraste AA en claro y oscuro.
- **Do** elegir el ancho del contenedor según la densidad de la pantalla; aprovechar el ancho en monitores grandes.

### Don't:
- **Don't** usar gradientes decorativos, glassmorphism porque sí, ni la plantilla hero-metric (número gigante + stats + acento). Es AI slop.
- **Don't** repetir grillas de cards idénticas (icono + título + texto) como recurso de layout.
- **Don't** usar `border-left`/`border-right` mayor a 1px como franja de color de acento. Usar borde completo, tinte de fondo o número/ícono al frente.
- **Don't** introducir un segundo acento ni colores de identidad partidaria. La paleta es neutra.
- **Don't** usar `#000` ni `#fff` planos como tinta/fondo de marca: los neutros son la escala zinc.
- **Don't** usar sombras oscuras o grandes; si la sombra se nota como caja, está mal.
- **Don't** inflar tamaños de fuente para marcar jerarquía: es peso y color.
