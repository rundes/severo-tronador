# Plan 05 — Listening de Instagram + Facebook por región

> Objetivo: traer publicaciones, reels, comentarios públicos de Instagram
> y Facebook geo-filtrados a la región definida en `/escucha` (lat/lng +
> radio). Sumarlos al pipeline existente (sentiment, tag clouds, feed,
> ranking de autores).

## Honestidad operativa primero

Meta cerró el acceso scrapeable a su contenido público en 2024 con el
shutdown de CrowdTangle (la herramienta gratuita que usaban
investigadores). Hoy hay **tres caminos legales y uno gris**:

### A. Meta Content Library + API (RECOMENDADO)

- Reemplazo oficial de CrowdTangle para investigación. Lanzado por Meta
  en 2024, gestionado por NYU + ICPSR. Acceso vía API JSON.
- Cubre: posts públicos de Facebook Pages y Groups, posts e Reels
  públicos de Instagram, comentarios públicos.
- Filtros: keyword, geo (Page country / Reel location), fecha,
  hashtag.
- **Requiere**: aplicación institucional. Vetting toma 2-4 semanas.
  Como Centro de Estudios Políticos y Electorales califica como
  research org. Necesitamos institutional email +
  descripción del proyecto + IRB-like approval o equivalente.
- **Cuota**: variable según institutional access. Suficiente para
  monitoreo geo continuo si se diseña bien.
- **Licencia**: solo para investigación, prohibido fines comerciales.
  Encaja con el posicionamiento "investigación social, no campaña".

URL: https://transparency.meta.com/researchtools/meta-content-library

### B. Instagram Graph API (LIMITADO)

- Solo permite a una página/business account leer SU propio contenido,
  no contenido público de terceros.
- Útil si los entes que queremos monitorear son **nuestros**
  (cuentas del Centro).
- No sirve para "escuchar la conversación regional" sobre temas.

### C. Facebook Pages API (LIMITADO)

- Similar a B: solo Pages de las que somos admin.
- Sirve para responder comentarios en nuestras propias Pages, no para
  monitorear conversación regional ajena.

### D. Scraping no oficial (NO RECOMENDADO)

- Apify, browser automation, third-party services.
- Viola TOS de Meta. Riesgo de cease & desist + ip block.
- No alineado con el discurso ético del Centro ("propósito declarado,
  metodología auditable").
- Skip.

## Decisión

Vamos con **A. Meta Content Library**. Mientras la aplicación está
en review, dejamos el connector stub y seguimos enriqueciendo el resto
del pipeline.

## Arquitectura

```
┌───────────────────────────────────────────────────────┐
│ /escucha  (Next.js)                                   │
│ ┌───────────────────────────────────────────┐         │
│ │  MapPicker → lat/lng + radio              │         │
│ └───────────────┬───────────────────────────┘         │
│                 ▼                                      │
│ ┌───────────────────────────────────────────┐         │
│ │  runListening() · lib/listening.ts        │         │
│ │  · GDELT (prensa)         ✅                │         │
│ │  · X API (tweets)         ✅                │         │
│ │  · Reddit (subreddits)    ✅ mock           │         │
│ │  · Meta Content Library   ⏳ NUEVO          │         │
│ │  · Telegram public        opt              │         │
│ └───────────────────────────────────────────┘         │
└───────────────────────────────────────────────────────┘
```

Cada source devuelve `ListenItem[]` con shape común (source, text, url,
publishedAt, author). El sentiment + tag cloud + ranking de autores ya
están armados para procesarlos.

## Connector design — `meta-content-library`

### Schema

```typescript
configSchema: [
  {
    key: "META_CL_TOKEN",
    label: "Content Library API token",
    type: "secret",
    required: true,
    help: "Token de acceso obtenido tras aprobación research."
  },
  {
    key: "META_CL_ACCOUNT_ID",
    label: "Researcher account ID",
    type: "text",
    required: true,
  },
]
```

### Query shape

```typescript
async fetch(query: ListenQuery): Promise<ListenItem[]> {
  const url = new URL("https://content-library.meta.com/v1/search");
  url.searchParams.set("token", token);

  // Geo: Content Library acepta lat/lng/radius para Reels con location.
  if (query.lat != null && query.lng != null) {
    url.searchParams.set("lat", String(query.lat));
    url.searchParams.set("lng", String(query.lng));
    url.searchParams.set("radius_km", String(query.radioKm ?? 25));
  }

  // Keywords: OR-joined query string.
  if (query.keywords.length) {
    url.searchParams.set("q", query.keywords.join(" OR "));
  }

  url.searchParams.set("platform", "instagram,facebook");
  url.searchParams.set("content_type", "post,reel,comment");
  url.searchParams.set("date_range", "last_7_days");
  url.searchParams.set("limit", "200");

  const res = await fetch(url);
  const json = await res.json();
  return mapToListenItems(json.results);
}
```

### Tipos esperados de items

| Content type | Mapeo a ListenItem |
|---|---|
| Post (caption + image) | text = caption, author = page_name, url = post_url |
| Reel | text = caption, author = creator_handle, url = reel_url, publishedAt = created_at |
| Comment | text = comment_text, author = commenter_handle, url = parent_post_url, publishedAt = comment_created_at |

Cada item se procesa por el pipeline ya existente. Sentiment heurístico
keyword, tag cloud, ranking de autores por cuántos posts/comments
tienen en pos/neg.

## Fases de entrega

### F1 — Aplicación a Meta Content Library (OPERATIVO, no código)

1. Email institucional con dominio `cpelectoral.org`.
2. Aplicación en https://transparency.meta.com/researchtools/meta-content-library
3. Descripción del proyecto: "Monitoreo de opinión pública por región
   geográfica para informar el diseño de encuestas. Sin propósito
   comercial. Datos no se redistribuyen. Cumple Ley 25.326 AR".
4. Esperar review (~2-4 semanas).
5. Obtener API token + account ID.

### F2 — Connector + UI

Una vez tengamos token:

1. `lib/connectors/meta-content-library.ts`: implementa
   `ListeningConnector`. Mock si no hay token; real con token.
2. Registry suma el connector.
3. `/escucha` lo muestra automáticamente como una de las fuentes con
   status real/mock siguiendo el patrón GDELT/X.
4. ListenQuery + lat/lng pasados al connector (ya soportados).

### F3 — Geo filter accurate

Content Library devuelve location_id de Pages/Reels solo cuando el
autor lo declaró. Cobertura geo es ~60% del contenido. Mitigación:
combinar geo explícita + keyword regional (nombre de barrio/ciudad).

### F4 — Comentarios threadeados

Cada Post de FB / Reel de IG puede tener N comentarios. La API permite
expansion `?include_comments=top_50`. Tronador los aplana como
`ListenItem` independientes con `url` apuntando al post padre.

### F5 — Pagination + cache

API rate-limit: aprox 200 items/min/account. Para zonas con alto
volumen necesitamos paginar y cachear:

- Materializar items pulled en tabla `listening_items` (ya existe).
- Cron horario que pagina la ventana 24h y hace upsert.
- runListening() lee de listening_items en lugar de hacer fetch live.

### F6 — Detección de tema emergente sobre Meta data

El pipeline actual de detección (3x más recent vs prior week) ya
funciona con los nuevos items. Lo único: aumentar el WINDOW por
ahora chico (7 días) si Meta data es ruidoso.

## Alternativas mientras esperamos aprobación

### A1. Hashtag-based via Instagram Basic Display

- Solo cuentas propias del Centro pueden ver sus propios posts
  vinculados a hashtags. No sirve regional.

### A2. CRC monitor (proxy via prensa)

GDELT ya cubre prensa que cita posts virales de IG/FB. Items con
"según un post de Facebook que se viralizó..." son una proxy
imperfecta pero usable.

### A3. Reddit como proxy

r/argentina, r/buenosaires, etc. discuten lo que pasa en IG/FB
local. Ya tenemos el connector Reddit en mock — activarlo con OAuth
real (F4 Plan 04 pendiente) puede dar señal sin Meta.

### A4. Open data municipal

Algunas intendencias publican monitoreo de menciones en redes como
open data. La Cámara Electoral AR a veces también.

## Costo

- Meta Content Library: gratis para research aprobado.
- Hosting de listening_items: ya en Supabase.
- Cron horario: free dentro de Vercel Hobby (1/día) o GitHub Actions
  (cada 5min).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Meta rechaza la aplicación | Fortalecer dossier con IRB-equivalente del Centro |
| API cierra otra vez (como CrowdTangle) | Diversificar: GDELT prensa + Reddit + Telegram público |
| Cuota insuficiente para monitoreo continuo | Cron incremental que solo trae items nuevos desde el último pull |
| Datos privados leakean | API solo devuelve público; aún así no exponer raw a clientes, agregar en topics |

## Timeline esperado

- F1 aplicación: 2-4 semanas.
- F2-F4 connector + pipeline: 1 semana de dev una vez aprobados.
- F5-F6: incremental.

## Mientras tanto: scaffold

Crear `lib/connectors/meta-content-library.ts` en modo 100% mock para
que aparezca como fuente "pendiente aprobación" en `/escucha` y los
filtros geo/keyword ya se preserven en el ListenQuery → cuando llegue
el token, swap del fetch real es 1 línea.
