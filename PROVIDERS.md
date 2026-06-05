# Proveedores de contactación — Severo Tronador

> **Scope de la herramienta**: investigación social y opinión pública (encuestas cuali/cuanti, relevamientos territoriales). **NO** se usa para campañas electorales ni posicionamiento de candidatos. Este encuadre habilita prácticamente todos los providers comerciales bajo la vertical de *Market Research / Survey*.

> **Qué está implementado hoy** (este doc compara *opciones* del mercado; no todas
> están conectadas). Conectores reales en `lib/connectors/registry.ts`: **Resend**
> (email), **Meta WhatsApp Cloud**, **Telnyx SMS** y **Telnyx Voice (IVR)**,
> **Telegram**, **Claude API** (análisis), y listening: **GDELT**, **RSS** de
> medios, **X** (API paga *o* sindicación gratis), **Reddit**, **Meta Content
> Library**. Mail `@tronador.net.ar` = **Cloudflare Email Routing + Resend**.
> **Bland AI / Vapi** (voz conversacional IA) figuran como opción de catálogo pero
> **no están implementados** (la voz hoy es Telnyx IVR).

## Consideraciones transversales

| Tema | Implicancia |
|---|---|
| **Ley 25.326 (Datos Personales, AR)** | El padrón se queda en el Sheet del cliente. Cada envío logea qué dato se usó y cuándo. Registro AAIP si se almacena base con datos personales. |
| **Consentimiento** | Para encuestas, el primer contacto debe declarar propósito ("encuesta de opinión, no comercial, no electoral") y ofrecer opt-out inmediato. |
| **Opt-out global** | Tabla `opt_outs` en el Sheet se consulta ANTES de cada envío, en TODOS los canales. |
| **Rate limiting** | Cada provider tiene su límite; nuestro cron respeta el más restrictivo del canal activo. |
| **Identificación clara** | Todo mensaje identifica al remitente ("Equipo de relevamiento") y el propósito investigativo. |

---

## 📧 Email

| Provider | Free tier | Costo a escala | Política | API DX | Recomendado |
|---|---|---|---|---|---|
| **Resend** ⭐ | 3.000/mes **permanente** | $20/mes → 50k | Sin restricción explícita a research/encuestas; requiere opt-in | Excelente, moderno | **Sí — fase 1** |
| **Brevo** (ex Sendinblue) | 300/día (~9k/mes) | $9/mes → 5k, $25/mes → 20k | Restringe listas políticas **no solicitadas**; research con opt-in OK | Buena, incluye SMS+WA | Sí (alt) |
| **MailerLite** | 1.000 contactos / 12k mes | $10/mes → 500 contactos | Permite encuestas, buena reputación | OK | Sí (alt) |
| **AWS SES** | 62k/mes free desde EC2 | $0.10 por 1.000 emails | Más barato del mercado; requiere reputación propia | API cruda, setup pesado | A escala |
| **SendGrid** | 60-day trial 100/día | Desde $19.95/mes | Estricto con bulk; cuentas suspendidas por bajo engagement | Maduro | No (free tier murió) |
| **Mailgun** | 30 días trial | Desde $35/mes | Permisivo si hay opt-in | Buena | No prioridad |
| **Postmark** | Solo paga | $15/mes → 10k | Solo transaccional, bloquean "bulk marketing" | Excelente | ❌ No sirve para encuestas masivas |
| **Mailchimp** | 500 contactos / 1k mes | Sube rápido con la lista | Permite, pero pricing castiga listas grandes | OK | No prioridad |
| **Listmonk** (self-hosted) | Gratis | $5/mes VPS + provider SMTP | Control total, sin TOS de tercero | API completa | **A escala / sustituto** |

**Recomendación**: arrancar con **Resend** (3k free, DX excelente, sin trabas para research). Cuando superemos free tier, evaluar **Brevo** (incluye SMS+WA en mismo dashboard) o migrar a **Listmonk self-hosted + AWS SES** como backend SMTP (más barato a volumen alto).

---

## 💬 WhatsApp

> **Crítico**: WhatsApp Business Platform [prohíbe explícitamente](https://business.whatsapp.com/policy) partidos políticos, candidatos y campañas electorales. Nuestro caso (research/encuestas) **NO entra en esa categoría** y la vertical "Market Research" es aceptada. Aplicar registrando la cuenta correctamente y usando templates de invitación a encuesta aprobados.

| Provider | Fee plataforma | Sobre tarifa Meta | Mín. mensual | Recomendado |
|---|---|---|---|---|
| **Meta Cloud API** (directo) ⭐ | $0 | 0% (es la fuente) | $0 | **Sí, si tenemos tech** |
| **360dialog** | €49/mes | **0% markup** | €49 | **Sí, a volumen** |
| **Gupshup** | ~$0.001/msg | Sobre tarifa Meta | $0 | Sí, LATAM-friendly |
| **Twilio** | $0.005/msg in+out | Sobre tarifa Meta | $0 | Setup rápido, caro a escala |
| **WATI** | $49/mes | **+20% markup** | $49 | ❌ Caro |
| **Infobip** | Custom | Custom | Enterprise | Solo si ya somos cliente |

**Tarifas Meta (categorías post-2024)**:
- **Service** (iniciada por usuario, ventana 24h): **gratis primeras 1.000/mes**
- **Marketing/Utility/Authentication** (iniciada por business): pago por mensaje, tarifa por país. AR ≈ $0.05–0.07 por conversación marketing.

**Recomendación**:
1. **Fase WhatsApp v1**: **Meta Cloud API directo** — 1.000 conversaciones service-initiated gratis/mes, sin intermediario. Setup mediano (verificación de business + número dedicado).
2. **Si escalamos a >5k/mes**: migrar a **360dialog** (subscription fija, sin markup) o quedarse en Meta directo.
3. **Si necesitamos arrancar en 1 día**: **Twilio for WhatsApp** (pay-as-you-go, sandbox inmediato), aceptando overhead de costo.

**Templates necesarios** (deben pre-aprobarse en Meta):
- Invitación a encuesta corta (con link a `/encuesta/[token]`)
- Recordatorio (24h después si no respondió)
- Agradecimiento post-respuesta

---

## 📱 SMS (Argentina)

> SMS a destinos AR es **caro** vs. mercados US/EU (~$0.08–0.10/SMS). Conviene usarlo para urgencia o cuando el destinatario no tiene smartphone, no como canal masivo de primera línea.

| Provider | Costo SMS AR | Free tier | Política | Local AR | Recomendado |
|---|---|---|---|---|---|
| **Twilio** | ~$0.085/SMS | Trial $15 crédito | Permite research con disclosure | No | Setup rápido |
| **Vonage** | ~$0.05–0.08 | $2 trial | Permite | No | Sí, cost-effective |
| **Plivo** | ~$0.05 (37% < Twilio) | $20 trial | Permite | No | **Sí — mejor ratio** |
| **Telnyx** | ~$0.04 (49% < Twilio) | $2 trial | Permite | No | **Sí — más barato** |
| **360nrs / WauSMS** (AR) | $0.10215/SMS | Saldo de prueba | Permite | **Sí** | Alternativa local |
| **Tecsid** (AR) | Variable por operadora | Consultar | Permite | **Sí** | Si necesitamos factura A AR |
| **Mensatek** (AR) | Variable | Consultar | Permite | **Sí** | Alt local |

**Recomendación**:
- **Primera elección**: **Telnyx** o **Plivo** — más baratos, API limpia, mismo SDK soporta voz.
- **Si necesitamos facturación local AR**: **360nrs** o **Tecsid** (factura A, soporte en español). Más caros pero simplifican lo contable.
- **Strategy**: limitar SMS a recordatorios cortos ("Tu encuesta sigue abierta: [link]"), no para texto largo.

---

## ☎️ Voz / IVR

> Para encuestas telefónicas automáticas (IVR) o registro manual de llamadas hechas por encuestadores.

| Provider | Costo/min saliente | IVR builder | Recomendado |
|---|---|---|---|
| **Telnyx** ⭐ | $0.004/min (49% < Twilio) | **Avanzado** (visual + API) | **Sí — IVR completo** |
| **Plivo** | 37% < Twilio | API-driven | Sí, simple |
| **Twilio** | Baseline (consultar AR) | Studio (visual) + TwiML | Maduro, caro |
| **Vonage** | ~$0.013/min | Voice API + IVR | Alternativa |
| **360nrs** (AR) | $0.17516/llamada (no por min) | Speech recording | Alt local |

**Recomendación**:
- **IVR para encuestas automáticas**: **Telnyx** — mejor relación costo/features de IVR.
- **Solo registro manual** (encuestador llama desde celular y carga resultado): no necesitamos provider de voz; basta con un formulario web mobile-friendly en la app.
- **Llamada outbound con grabación**: Twilio o Telnyx, ambos generan recording URL que guardamos como referencia en Sheet.

### 🤖 Agentes de voz con IA (alternativa conversacional al IVR clásico)

> **Cambio de paradigma**: un agente de voz IA mantiene conversaciones reales por teléfono combinando LLM + speech-to-text + text-to-speech. Comprende habla no estructurada, repregunta si la respuesta es ambigua, y reemplaza el menú rígido del IVR por una **entrevista conversacional natural**. La barra de calidad actual es latencia end-to-end <800 ms.

| Plataforma | Costo all-in | Fortaleza | Recomendación |
|---|---|---|---|
| **Vapi** | $0.05/min orquestación + LLM (~$0.15–0.30 all-in) | Más flexible para devs, multi-LLM | **Top pick si construimos algo custom** |
| **Retell AI** | $0.055/min + LLM (~$0.07–0.31 all-in) | Mejor turn-taking (sensación natural) | Si la calidad conversacional es prioridad |
| **Bland AI** | $0.11–0.14/min bundled (todo incluido) | Más barato a escala, paquete cerrado | **Si queremos costo predecible** |
| **ElevenLabs Conv AI** | $0.10/min (sin LLM) | Mejor calidad de voz del mercado | Si la naturalidad de voz es crítica |

**Costo realista de una encuesta telefónica por IA**: encuesta de 5 min × 100 personas = 500 min. Con Bland AI (~$0.13/min bundled) ≈ **$65 por 100 encuestas completas**, sin humanos. Comparado con encuestador humano AR (~500 min × $15/hr ≈ $125 + coordinación), el ahorro es ~50% y escala a miles de llamadas sin sumar staff.

**Encaje en el modelo de conectores**: estos servicios entran como conectores `outreach` con capability `voice.conversational_survey` (ver [ARCHITECTURE.md §3](./ARCHITECTURE.md)). Telnyx IVR sigue siendo la opción para flujos de menú simples y baratos; los agentes IA son para encuestas con preguntas abiertas donde importa la repregunta.

---

## 📋 Formularios / Encuestas web

Para la landing `/encuesta/[token]` tenemos dos caminos: **construirla nosotros** dentro de la app Next.js (recomendado, control total), o **integrar herramienta externa**.

| Herramienta | Free tier | API / Sheets | Branding propio | Recomendado |
|---|---|---|---|---|
| **Built-in (Next.js form)** ⭐ | Gratis | Nativo a nuestro Sheet | Total | **Sí — encuesta principal** |
| **Google Forms** | Gratis, ilimitado | Sheets nativo | Limitado | Sí — encuestas ad-hoc rápidas |
| **Tally** | Free unlimited | Sheets vía API/Zapier | Bueno | Sí — alt rápida |
| **Typeform** | 10 resp/mes free | Sheets vía Zapier | Excelente | Caro ($25/mes) |
| **Jotform** | 100 resp/mes free | Sheets nativo | Bueno | OK |
| **LimeSurvey CE** | Gratis, self-hosted | Plugins | Total | Para cuali compleja |

**Recomendación**: encuestas core dentro de **la app misma** (control de tracking token, validación contra padrón, log directo al Sheet). **Google Forms / Tally** quedan como atajo para piezas ad-hoc que no justifican código.

---

## ✈️ Telegram (bonus channel)

> Penetración menor que WhatsApp en AR, pero **gratis**, sin restricciones políticas, y API permisiva. Vale tenerlo como canal complementario.

- **Bot API**: completamente gratis, sin per-message charge
- Broadcast: 30 msgs/seg gratis, 1.000/seg con Paid Broadcasts (0.1 Stars/msg ≈ centavos)
- Sin restricción a contenido de research o cívico
- **Limitación**: el usuario debe iniciar conversación con el bot primero (`/start`); no se puede contactar en frío

**Caso de uso**: ofrecer "respondé por Telegram: t.me/severo_maipu_bot" como canal opt-in alternativo en otros materiales (volantes, redes).

---

## 👂 Social listening (canal pasivo — Brandwatch & cía)

> Mientras los canales anteriores son **activos** (nosotros contactamos al ciudadano), social listening es **pasivo**: monitoreamos qué dice la ciudadanía organicamente en X/Twitter, Reddit, TikTok, foros y noticias. Útil para **detectar temas emergentes ANTES de diseñar una encuesta**, calibrar sentiment baseline por barrio/tema, o disparar alertas en tiempo real.

| Plataforma | Pricing 2026 | Fuentes | IA destacada | Recomendación |
|---|---|---|---|---|
| **Brandwatch** | Desde **$800/mes** (anual); típico $25k+/año | 100M+ (X, Reddit, TikTok, 70k podcasts, foros, news, blogs) | **Iris AI**: "Ask Iris" NL queries, AI dashboards narrativos, query writer automático | Enterprise — sobrado para municipio salvo presupuesto alto |
| **Talkwalker** (ahora Hootsuite) | ~$9.6k/año entry; $27k+/año típico | Global + visual AI (image recognition) | Blue Silk AI | Similar a BW, fuerte en visual |
| **Meltwater** | ~$25k/año mediano | PR + medios + social | Klear (influencers) | Mejor para PR/medios tradicionales |
| **Brand24** ⭐ | **$99–$199/mes** | X, Reddit, TikTok, IG, FB, web, blogs | Sentiment + AI insights | **Mejor relación costo/feature para municipio** |
| **Buska** | $49/mes | 30+ plataformas | AI intent scoring | Alternativa barata SMB |
| **Mention** | $41/mes (free tier limitado) | Web + redes | Sí | Alternativa SMB |
| **DIY** (X API Basic + Reddit API + Claude) | $0–$200/mes | Lo que integremos | Claude para sentiment | **Si tenemos dev time** |
| **Google Alerts** | Gratis | Web | Ninguna | Mínimo viable, no real-time |

### 🤖 Iris AI (lo destacado de Brandwatch en 2026)

- **"Ask Iris"**: chat conversacional sobre el dataset — "¿qué se dice de transporte público en tu ciudad en los últimos 30 días?" devuelve respuesta narrativa con citas
- **AI Dashboards**: genera resúmenes ejecutivos automáticos sobre cualquier query
- **AI Query Writer**: traduce prompts en lenguaje natural a queries Booleanas complejas
- **Conversation Insights**: agrupa miles de menciones en clusters temáticos digeribles
- **Roadmap 2026**: análisis de video/imagen, "Bring Your Own Data" (cargar tus propios datasets), expansión a APAC y nueva app mobile

### Casos de uso documentados en sector público

Brandwatch tiene [guía específica para gobierno](https://www.brandwatch.com/guides/social-listening-for-government-best-practices/) con casos como:
- Detectar shifts en prioridades ciudadanas (cambio climático, accountability, servicios)
- Crisis comms en tiempo real
- Validar mensajes oficiales antes/después de lanzamiento
- Detectar misinformation que requiera respuesta institucional
- (UK) Tienen procurement pathway pre-aprobado para entes públicos

### Decisión para Severo Tronador

| Escenario | Recomendación |
|---|---|
| Fases F1–F6 | **Omitir** — foco en contactación activa |
| F7+ con presupuesto bajo (~$0–$200/mes) | **DIY**: X API Basic Tier (free) + Reddit API (free) + Claude API para sentiment → replica ~80% del valor por <$50/mes. Requiere ~2 semanas de dev. |
| F7+ con presupuesto medio (~$1.2k/año) | **Brand24** — cobertura buena, IA decente, asequible para municipio |
| F7+ con presupuesto alto (~$25k+/año) | **Brandwatch** — si necesitamos profundidad de podcasts/foros, reportes institucionales, o el storytelling de Iris para presentar a stakeholders |

> **Insight de arquitectura**: Brandwatch (o cualquier social listening) y Severo Tronador son **complementarios, no sustitutos**. Brandwatch detecta de qué está hablando la gente; Severo Tronador pregunta directo a una muestra controlada del padrón. La pipeline ideal: usar listening para **descubrir temas**, después usar encuestas para **medir prevalencia** en la población objetivo.

---

## 🗺️ Social listening con foco territorial (alternativas a Brandwatch)

> El uso "escuchar un territorio" es **distinto** al uso clásico de social listening ("monitorear mi marca"). Cambia la pregunta de "¿qué dicen de mí?" a "¿qué dicen acá?". Esto desbloquea una familia de herramientas más adecuadas y un par de gemas open source.

### El caso particular de un territorio chico

Vale aclarar la economía antes de elegir: un municipio o territorio chico **no genera el volumen de menciones** que justifica un Brandwatch / Talkwalker enterprise; los mínimos de plan (típicamente miles de menciones/mes) no se llenan ni de cerca. Esto **refuerza** la pirámide de costos hacia abajo (cuanto más chico el territorio, más conviene DIY):

- **Enterprise SaaS ($25k+/año)**: sobredimensionado salvo presupuesto generoso o ambición provincial
- **Purpose-built municipal ($pricing custom, escalable)**: **Zencity** — diseñado para este tamaño
- **SMB con geo ($49–$199/mes)**: Awario, Brand24, Mention, Atribus
- **Open source + DIY ($0–$50/mes)**: GDELT + scraping propio + Claude — viable porque el volumen es bajo

### 🏛️ Tier 1 — Purpose-built para gobierno local

#### Zencity ⭐⭐ — La herramienta más relevante para este caso

[Zencity](https://zencity.io/) es una plataforma israelí usada por **cientos de municipios** globalmente (mayoría US/UK/Israel, también algunos LATAM). Lo que la hace específica para nuestro caso:

| Feature | Por qué importa para un gobierno local |
|---|---|
| **Sentiment model calibrado para local gov** (lanzado abril 2025) | No mide sentiment de "marca" genérica, mide percepción específica sobre servicios municipales, gestión, obra pública |
| **Integra múltiples fuentes** | Social (Nextdoor, Facebook, Twitter, Instagram) + 311 calls + medios locales + encuestas propias en una sola vista |
| **AI Insights** ("ZenCity AI") | Resume miles de mentions/posts/llamadas en temas accionables sin necesidad de queries Booleanas |
| **Encuestas integradas** | Vienen del NRC (mergeado con Polco), pueden lanzarse desde la misma plataforma — competiría con nuestra app |
| **Benchmarking** | Compara métricas contra otros municipios similares |

**Pricing**: no público, escala con tamaño del municipio. El ticket histórico para municipios medianos ronda **$15k–$40k/año**; tiene un plan "Essentials" más liviano (2024) para municipios chicos. Para un territorio chico es muy probablemente **sobredimensionado** salvo presupuesto institucional.

**Decisión**: si la herramienta se despliega para un **gobierno local con presupuesto**, Zencity es competencia directa **y** complemento posible. Sin Zencity = construimos nosotros más. Con Zencity = nos enfocamos en la pieza que ellos no cubren bien (segmentación fina del padrón).

#### Polco

Plataforma de civic engagement (encuestas + community input + benchmarks). Mergeó con NRC. Cubre 500+ jurisdicciones en US. Foco US, sin presencia LATAM relevante. **Mencionar como referencia conceptual**, no como provider real para Argentina.

### 🌎 Tier 2 — Enterprise con geofencing (Brandwatch y amigos)

| Plataforma | Capacidad geo | Notas |
|---|---|---|
| **Brandwatch** | [Geofence queries Booleanas](https://www.brandwatch.com/blog/geofence-queries/) | Permite definir polígonos; cubierto en sección 5.7 |
| **Talkwalker** | Geo + visual AI (image recognition de imágenes geotagueadas) | Fuerte en multi-idioma |
| **Meltwater** | Filtros por país/región, integra GenAI search | Mejor para PR/medios |
| **Synthesio** (Ipsos) | Global geo, X heatmaps, demografía + psicografía | Pensado para investigación de mercado; el más cercano filosóficamente a Severo |
| **Sprinklr** | Location metadata en X (country code) | 30+ canales |
| **NetBase Quid** | Va más allá de social (patentes, foros, reviews) | Market intelligence más que listening |
| **Geofeedia** | **Geospatial puro** — polígonos, lenses, geofences sobre cualquier zona | Especializado, usado por seguridad pública y eventos |
| **Snaptrends** | Geofences de cualquier forma | Similar a Geofeedia, foco eventos |

**Síntesis**: para una ciudad chica con presupuesto medio, son sobredimensionados. **Brand24/Awario** (Tier 3) entregan ~70% de la utilidad a 10% del costo.

### 💸 Tier 3 — SMB con geo asequible (sweet spot probable)

| Plataforma | Pricing | Geo | Mention-to-$ ratio | Recomendación |
|---|---|---|---|---|
| **Awario** ⭐ | $49/mes (Starter) | Filtros por país/ciudad/idioma | **1.932 menciones/$** (2× Brand24) | Mejor balance: Boolean queries desde plan básico, scan de 13B páginas/día |
| **Brand24** | $99–$199/mes | Filtros por país/idioma | 649 menciones/$ | Mejor UX y sentiment; más caro por mención |
| **Mention** | $41/mes (con free tier limitado) | Filtros básicos | Variable | Alternativa light |
| **YouScan** | Custom (~$300/mes en LATAM) | Geo + **visual recognition** | — | Fuerte en EU/CA; visual analysis poderoso para Instagram |
| **Pulsar** | Enterprise | Geo + audience cluster | — | B2B enterprise; potente pero overkill |

### 🇦🇷 Tier 4 — LATAM y español

| Plataforma | Origen | Cobertura AR | Notas |
|---|---|---|---|
| **Atribus** ⭐ | España, con presencia LATAM (MX, CL, AR) | Sí — soporte en español, monitorea medios AR | Social + medios + foros + blogs. Mejor opción "regional" si queremos soporte en castellano y conocimiento del mercado local. Pricing custom (~$200–$500/mes típico). |
| **Audiense** | UK, fuerte español | Audience intelligence más que listening puro | Pensar como complemento, no sustituto: segmenta y describe audiencias detectadas, no las monitorea en tiempo real |
| **Bunker DB** | Mexicano | Sí | Marketing analytics + social, ecosistema LATAM |
| **Coobis** | España | Sí | Más para influencers que listening puro |

### 🔓 Tier 5 — Open source y DIY (el más viable para presupuesto cero)

Para territorio chico, **estas opciones combinadas reemplazan a Brand24/Awario por costo casi nulo**:

#### GDELT Project ⭐ — el secreto mejor guardado

[GDELT](https://www.gdeltproject.org/) (Global Database of Events, Language, and Tone) es un proyecto académico que monitorea **toda la prensa mundial en 100+ idiomas, con geocoding automático, actualización cada 15 minutos**, archivo desde 1979 — **gratis y abierto via BigQuery o downloads**.

- Cada artículo procesado tiene: ubicación geográfica detectada, personas, organizaciones, temas (CAMEO codes), tono/sentiment, imágenes
- Query: `WHERE Locations LIKE '%<tu ciudad>%' AND DATEADDED > now() - 7 days`
- **Para periodismo y monitoreo de medios locales, es directamente lo mejor que existe** — y es gratis
- Limitación: NO cubre redes sociales, sólo prensa online indexada por Google News y agregadores

#### Mediacloud — análisis de cobertura mediática

[Mediacloud](https://www.mediacloud.org/) — plataforma open source de MIT/Northeastern para análisis cuanti de cobertura mediática. Útil para "¿cuánto se habló de transporte público en medios de la zona el último mes?".

#### Scraping de redes (con cuidado)

- **snscrape** (Python): scraper de X, Reddit, IG, FB, Telegram. **X cambió TOS en 2023**, scraping de Twitter ahora es legalmente borroso y técnicamente más difícil. Forks de la comunidad siguen funcionando intermitentemente.
- **X API Basic Tier** (free): 1.500 tweets/mes, suficiente para queries puntuales geo-filtradas
- **X API Pro Tier**: $200/mes, 1M tweets/mes — alcanza para un municipio con margen
- **Reddit API**: gratis con límites razonables, no hay mucho contenido AR pero r/argentina (y subreddits regionales de la zona) son monitorizables
- **Facebook/Instagram**: virtualmente cerrados a scraping; necesitan **CrowdTangle** (gratis para investigadores y ONG si aún lo dan) o aceptar que ese canal queda fuera

#### Stack DIY recomendado

```
┌─ Inputs ────────────────────────────────────────────┐
│ GDELT (gratis)        → Medios online geo-filtrados │
│ X API Basic ($0/mes)  → Tweets con location local  │
│ Reddit API (free)     → r/argentina + regionales    │
│ RSS feeds locales     → portales de la zona         │
└───────────────────┬─────────────────────────────────┘
                    ▼
┌─ Procesamiento ─────────────────────────────────────┐
│ Cron job (Vercel, $0) → consolida en Google Sheet   │
│ Claude API (~$10/mes) → sentiment + clustering      │
└───────────────────┬─────────────────────────────────┘
                    ▼
┌─ Output ────────────────────────────────────────────┐
│ Dashboard en la misma app Next.js                   │
│ Trigger automático: si volumen sobre tema X         │
│ crece > 3× baseline → notificar para diseñar        │
│ encuesta sobre ese tema                             │
└─────────────────────────────────────────────────────┘
```

**Costo total**: ~$10–$50/mes. **Esfuerzo dev**: ~2 semanas. **Cubre**: 80% del valor que daría Brand24 para este tamaño de territorio.

### Tabla resumen — recomendación por escenario

| Quién es el cliente | Presupuesto | Recomendación |
|---|---|---|
| **Gobierno local** (institucional) | Alto (~$15k+/año) | **Zencity** — purpose-built para municipios |
| **Equipo de investigación / ONG** | Medio ($200–$500/mes) | **Atribus** (español + LATAM) o **Awario** (ratio costo/mención) |
| **Proyecto independiente** | Bajo (<$50/mes) | **DIY: GDELT + X API Basic + Claude** — integrado en la misma app Severo Tronador |
| **Fase exploratoria** | $0 | **Google Alerts + monitoreo manual de Twitter/X y FB locales** + un Sheet |

### Insight final

Para Severo Tronador en su forma actual (relevamiento territorial + encuestas), el **stack DIY con GDELT en F7** es probablemente lo correcto: el listening alimenta el diseño de encuestas, y los componentes son baratos, controlables, y se integran nativamente en la misma app. **Zencity** entra en consideración sólo si el sponsor es la municipalidad y hay presupuesto institucional.

---

## 🧩 Proyectos open source relevantes

> Software libre que conviene **usar, integrar o tomar como referencia**. Se evalúa cada uno por mantenimiento, ajuste a research (no electoral), riesgo legal/TOS, y si vale adoptarlo o sólo inspirarse.

### Email self-hosted

| Proyecto | Stack | Uso para nosotros |
|---|---|---|
| **Listmonk** ⭐ (16k★) | Go + Postgres | Sustituto de Resend/Brevo a escala. Corre en VPS de $5/mes, conectado a AWS SES como backend SMTP. |
| **Postal** (14k★) | Ruby on Rails | Servidor SMTP completo self-hosted, si queremos correr nuestro propio mail server. |
| **Mautic** (8k★) | PHP + MySQL | ❌ Demasiado pesado (4 GB RAM mín), más automatización de la que necesitamos. |

### WhatsApp no oficial (⚠️ violan TOS de Meta)

> Se conectan al protocolo de **WhatsApp Web** (Linked Devices), **no** a la Cloud API oficial. Implica riesgo de baneo del número. Aceptable para experimentación con destinatarios consentidos en un número descartable; **nunca** con número productivo o padrón en frío.

| Proyecto | Qué hace | Riesgo |
|---|---|---|
| **Baileys** (WhiskeySockets, 17k★) | Librería TS/JS de bajo nivel sobre WhatsApp Web | Alto — ban garantizado en frío |
| **Evolution API** (6× en 2026) | API REST sobre Baileys, muy popular en LATAM (n8n + WhatsApp) | Alto — mismo riesgo + protocolo cambiante |
| **whatsapp-web.js** (16k★) / **WPPConnect** (5k★) | Otras librerías sobre el protocolo WA Web | Alto — ídem |

**Decisión WhatsApp**: producción = **Meta Cloud API oficial** (vertical Survey/Research). Experimentación local consentida = Evolution API en número descartable. Nunca Baileys con número productivo.

### Forms / Encuestas open source

| Proyecto | Licencia | Uso para nosotros |
|---|---|---|
| **SurveyJS** ⭐ (5k★) | MIT (core) | Librería JS embebible — ideal para renderizar la encuesta dentro de Next.js sin reinventar la rueda. JSON schema versionable. |
| **Formbricks** (10k★) | AGPLv3 | Suite estilo Qualtrics open. Self-host con Docker, editor visual de encuestas. |
| **LimeSurvey CE** | GPL | Veterano de encuestas científicas, 80+ idiomas, export SPSS/R/Stata. Heavy pero confiable para estudios formales. |
| **Typebot** (10k★) / **Botpress** (14k★) | AGPLv3 / MIT | Flow builders conversacionales con WhatsApp + Telegram nativos. Alternativa a construir el flujo nosotros. |
| **OpnForm** (5k★) | AGPLv3 | Form builder open source simple. |

### Inbox omnicanal y orquestación

| Proyecto | Resuelve |
|---|---|
| **Chatwoot** ⭐ (23k★) | Inbox compartido para que el equipo responda mensajes entrantes (WhatsApp, Telegram, email, SMS, IG) en un solo lugar. Integra con Evolution API y con LLM para sugerencias de respuesta. **Recomendado a partir de F4** si el volumen de respuestas libres lo justifica. |
| **Erxes** (4k★) | CRM + inbox omnicanal, alternativa más completa pero más pesada. |
| **n8n** (60k★) | Orquestador estilo Zapier auto-hosteable. Pegamento entre Sheets, Evolution API, Telegram, etc. sin código, para flujos ad-hoc. |
| **VICIdial** | Predictive dialer para call centers serios. Sólo si crecemos a operación masiva de llamadas humanas. |

### Referencia (no adoptar, sí mirar)

- **CiviCRM** — CRM cívico maduro; útil como referencia de esquema de datos (para nosotros Sheets alcanza).
- **MoveOn Spoke / Action Network** — mass-texting y plataforma cívica; framing electoral, valen como referencia de UX de envío masivo.

---

## 🚀 Tecnología innovadora a vigilar (2026)

- **RCS (Rich Communication Services)** de Google: SMS evolucionado con imágenes, botones, sin app extra. Adopción AR aún baja pero crece; costo similar a SMS premium.
- **WhatsApp Flows**: formularios nativos **dentro** de WhatsApp sin link externo — menos fricción para encuestas. Se configuran desde Meta Cloud API (encaja en el conector `meta-wa-cloud`).
- **Voice cloning ético**: TTS personalizado con voz consentida para comunicación institucional, con disclosure. **No** usar para campañas.
- **Análisis cualitativo con LLM**: pipeline de coding inductivo→deductivo + clustering por embeddings sobre respuestas abiertas. Detallado como conector `analysis` en [ARCHITECTURE.md §5b](./ARCHITECTURE.md).

---

## 🎯 Stack recomendado por fase

| Fase | Email | WhatsApp | SMS | Voz | Encuesta |
|---|---|---|---|---|---|
| **F0–F2 (MVP, sin envíos reales)** | Mock | Mock | Mock | — | Built-in Next.js |
| **F3 (primer canal real)** | **Resend** (3k free) | — | — | — | Built-in |
| **F4 (WhatsApp)** | Resend | **Meta Cloud API directo** | — | — | Built-in |
| **F5 (SMS)** | Resend | Meta Cloud | **Telnyx** o **360nrs** | — | Built-in |
| **F6 (Voz)** | Resend | Meta Cloud | Telnyx | **Telnyx IVR** (menú; implementado). Voz conversacional IA (Bland AI/Vapi) = futuro, no implementado | Built-in |
| **A escala** | Brevo o Listmonk+SES | 360dialog o Meta directo | Telnyx (volumen) o 360nrs (factura AR) | Telnyx + Bland AI / Vapi | Built-in + Google Forms para ad-hoc |

## ⚠️ Providers descartados (con razón)

| Provider | Por qué no |
|---|---|
| **Mailchimp** | Pricing castiga listas grandes; framing marketing no calza con research |
| **Postmark** | Solo transaccional, bloquea bulk |
| **SendGrid** | Free tier eliminado; competencia más barata |
| **WATI** | +20% markup sobre Meta innecesario |
| **CallHub / Spoke / Rumbleup** | Diseñados para campañas electorales — framing equivocado para nuestro caso |
| **Mautic** | Demasiado pesado (4GB RAM, complejidad) para lo que necesitamos |

---

## Fuentes consultadas

- [WhatsApp Business Messaging Policy](https://business.whatsapp.com/policy)
- [Meta Cloud API pricing 2026](https://www.engagelab.com/blog/whatsapp-business-api-pricing)
- [Twilio vs 360dialog comparison](https://www.kommunicate.io/blog/twilio-vs-360dialog-a-comparison/)
- [Email API pricing comparison 2026](https://www.buildmvpfast.com/api-costs/email)
- [Brevo for political campaigns review](https://www.sequenzy.com/email-marketing-for/political-campaigns)
- [Resend Acceptable Use Policy](https://resend.com/legal/acceptable-use)
- [SMS API comparison Twilio/Plivo/Vonage](https://www.buildmvpfast.com/api-costs/sms)
- [Argentina SMS pricing](https://www.sent.dm/resources/argentina-sms-pricing)
- [360nrs Argentina pricing](https://en.360nrs.com/prices/argentina)
- [Telnyx vs Twilio](https://telnyx.com/resources/telnyx-vs-twilio-which-voice-api-is-better)
- [Top survey tools 2026](https://www.guideflow.com/blog/survey-software-tools)
- [Telegram Bot API docs](https://core.telegram.org/bots/api)
- [Listmonk self-hosted](https://listmonk.app/)
- [WhatsApp government bodies exception (360dialog)](https://docs.360dialog.com/docs/waba-basics/waba-for-government-agencies)
