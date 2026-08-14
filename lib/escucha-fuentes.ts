// Partición de la lista única listening_config.rss_feeds en tipos de fuente
// para la UI de configuración. El almacenamiento sigue siendo una sola lista
// (cero migración); la UI muestra un campo por tipo y acá se separa/une.
//
// Tipos por host:
//   facebook.com / instagram.com → páginas/grupos (los procesa infra/fb-worker)
//   t.me                         → canales públicos de Telegram
//   resto                        → medios: feed RSS/Atom, sitio a secas o YouTube

export interface FuentesPartition {
  medios: string[];
  facebook: string[];
  telegram: string[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function partitionFeeds(feeds: string[]): FuentesPartition {
  const out: FuentesPartition = { medios: [], facebook: [], telegram: [] };
  for (const f of feeds) {
    const h = hostOf(f);
    if (h.endsWith("facebook.com") || h.endsWith("instagram.com")) {
      out.facebook.push(f);
    } else if (h === "t.me") {
      out.telegram.push(f);
    } else {
      out.medios.push(f);
    }
  }
  return out;
}

// Normalizadores de entrada de la UI: aceptan lo que la gente pega.
// FB: URL completa o "facebook.com/..." sin esquema.
export function normalizeFbUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  const h = hostOf(withScheme);
  if (!h.endsWith("facebook.com") && !h.endsWith("instagram.com")) return null;
  return withScheme;
}

// Telegram: "@canal", "canal", "t.me/canal" o URL completa → https://t.me/canal
export function normalizeTgChannel(raw: string): string | null {
  let s = raw.trim().replace(/^@/, "");
  if (!s) return null;
  s = s.replace(/^https?:\/\/(www\.)?t\.me\//i, "").replace(/^t\.me\//i, "");
  const name = s.replace(/^s\//, "").split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9_]{4,}$/.test(name)) return null;
  return `https://t.me/${name}`;
}

// Reloj para server components: react-hooks/purity prohíbe Date.now() dentro
// del render aunque sea server-only (los tiempos relativos "hace N min" lo
// necesitan). Un render por request → estable dentro del render.
export function renderNow(): number {
  return Date.now();
}

// Clave de stats con la que ese feed aparece en listening_items.source.
export function statsKeyFor(url: string): string {
  const h = hostOf(url);
  if (h.endsWith("facebook.com") || h.endsWith("instagram.com")) {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const ident =
      parts[0] === "groups"
        ? parts[1]
        : parts[0] === "profile.php"
          ? u.searchParams.get("id")
          : parts[0];
    return `facebook/${ident ?? ""}`;
  }
  if (h === "t.me") {
    const name = new URL(url).pathname.replace(/^\/(s\/)?/, "").split("/")[0];
    return `t.me/${name}`;
  }
  return h;
}
