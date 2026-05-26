# Proveedores de contactación — Severo Tronador

> **Scope de la herramienta**: investigación social y opinión pública (encuestas cuali/cuanti, relevamientos territoriales). **NO** se usa para campañas electorales ni posicionamiento de candidatos. Este encuadre habilita prácticamente todos los providers comerciales bajo la vertical de *Market Research / Survey*.

## Consideraciones transversales

| Tema | Implicancia |
|---|---|
| **Ley 25.326 (Datos Personales, AR)** | El padrón se queda en el Sheet del cliente. Cada envío logea qué dato se usó y cuándo. Registro AAIP si se almacena base con datos personales. |
| **Consentimiento** | Para encuestas, el primer contacto debe declarar propósito ("encuesta de opinión, no comercial, no electoral") y ofrecer opt-out inmediato. |
| **Opt-out global** | Tabla `opt_outs` en el Sheet se consulta ANTES de cada envío, en TODOS los canales. |
| **Rate limiting** | Cada provider tiene su límite; nuestro cron respeta el más restrictivo del canal activo. |
| **Identificación clara** | Todo mensaje identifica al remitente ("Equipo de relevamiento Maipú") y el propósito investigativo. |

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

- **"Ask Iris"**: chat conversacional sobre el dataset — "¿qué se dice de transporte público en Maipú en los últimos 30 días?" devuelve respuesta narrativa con citas
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

## 🎯 Stack recomendado por fase

| Fase | Email | WhatsApp | SMS | Voz | Encuesta |
|---|---|---|---|---|---|
| **F0–F2 (MVP, sin envíos reales)** | Mock | Mock | Mock | — | Built-in Next.js |
| **F3 (primer canal real)** | **Resend** (3k free) | — | — | — | Built-in |
| **F4 (WhatsApp)** | Resend | **Meta Cloud API directo** | — | — | Built-in |
| **F5 (SMS)** | Resend | Meta Cloud | **Telnyx** o **360nrs** | — | Built-in |
| **F6 (Voz)** | Resend | Meta Cloud | Telnyx | **Telnyx IVR** | Built-in |
| **A escala** | Brevo o Listmonk+SES | 360dialog o Meta directo | Telnyx (volumen) o 360nrs (factura AR) | Telnyx | Built-in + Google Forms para ad-hoc |

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
