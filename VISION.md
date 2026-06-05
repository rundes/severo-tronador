# Severo Tronador — Visión

> El norte del proyecto. El **por qué** y el **qué es en esencia**.
> Para el **cómo técnico** ver [ARCHITECTURE.md](./ARCHITECTURE.md); para el **cuándo** ver [PLAN.md](./PLAN.md); para el **abanico de servicios** ver [PROVIDERS.md](./PROVIDERS.md).

---

## En una frase

Severo Tronador toma **tu base de contactos** y le da el poder de la **segmentación fina** y una **estrategia multicanal asistida** para contactar a las personas correctas, por el medio correcto, y **obtener respuestas** — campañas de comunicación, encuestas e intercambios — maximizando los **recursos gratuitos** de un abanico de servicios que crece como plugins, sin tocar el núcleo.

---

## El problema que resuelve

Tenés una base de contactos valiosa (tu padrón o lista enriquecida) y querés **conversar** con la gente: preguntarles, escucharlos, medir opinión, invitarlos. Pero el panorama está roto en tres frentes:

1. **Las herramientas son monocanal o carísimas.** Email por un lado, WhatsApp por otro, SMS en una tercera, encuestas en una cuarta. Cada una con su login, su dashboard, su factura. Nada habla con nada.
2. **Los free tiers son generosos pero invisibles.** Resend regala 3.000 emails/mes, Meta 1.000 conversaciones, Telegram es ilimitado. Pero ninguna herramienta te muestra cuánto te queda ni te ayuda a no quemarlo. Terminás pagando por no saber.
3. **El contacto se trata como descartable.** Las plataformas piensan en "campañas" y "envíos masivos". Nadie cuida la **relación** con cada persona: cuántas veces la molestaste, si te respondió, por qué canal prefiere que la contactes, cuándo conviene dejarla descansar.

Severo Tronador existe para resolver los tres a la vez.

---

## La idea central

```
   TU BASE DE CONTACTOS                    EL ABANICO DE SERVICIOS
   (el activo)                             (plugins activables)
        │                                        │
        ▼                                        ▼
   ┌─────────────┐      ┌──────────────┐    ┌─────────────────────┐
   │ Segmentación│─────►│  Vos elegís  │───►│ 📧 💬 📱 ☎️ ✈️ 👂  │
   │    fina     │      │  el canal,   │    │ email · wa · sms ·  │
   │             │      │  el sistema  │    │ voz · telegram ·    │
   │ ¿a quién?   │      │  te asesora  │    │ listening · ...     │
   └─────────────┘      └──────────────┘    └─────────────────────┘
                               │                      │
                               ▼                      ▼
                        ┌──────────────────────────────────┐
                        │  RESPUESTAS                        │
                        │  encuestas · comunicación ·        │
                        │  intercambios → de vuelta a la     │
                        │  ficha de relación de cada contacto│
                        └──────────────────────────────────┘
```

No es "una app de email con WhatsApp pegado". Es una **capa de orquestación sobre tu base de contactos**, donde cada servicio externo es un plugin intercambiable y el sistema entero está optimizado para una sola cosa: **conseguir respuestas de calidad sin gastar de más ni quemar la relación**.

---

## Los seis pilares del sentido

### 1. La base de contactos es el activo — todo gira alrededor del contacto

La unidad atómica **no es la campaña, es el contacto.** Cada persona tiene una **ficha de relación** persistente: cuándo la contactaste, por qué canal, si respondió, qué dijo, qué medio prefiere, cuándo vuelve a estar disponible. Las campañas son *vistas efímeras* sobre esos contactos; los contactos son el dato permanente que se enriquece con cada interacción.

> Una campaña termina. La relación con el ciudadano sigue. La herramienta protege lo segundo.

### 2. El abanico de servicios es un sistema de plugins — agregar uno no toca el núcleo

Cada servicio externo (Resend, Meta Cloud, Telnyx, Telegram, GDELT, Claude API, Google Sheets…) es un **conector** que se instala, configura, prueba, activa y desactiva desde la misma pantalla, con la misma interfaz — igual que los *connectors* de Claude. La app no sabe de "email" o "whatsapp" en abstracto: sabe consumir conectores que declaran *capabilities*.

**Consecuencia directa de lo que pediste:** "que se puedan agregar más a lo largo del tiempo como plugins que se activan al integrar desde aquí las funcionalidades correspondientes" → eso **es** el modelo de conectores. Sumar Brevo, 360dialog, Brand24 o Listmonk mañana = un archivo nuevo + una línea en el registry. Cero cambios en la UI o en la lógica de negocio. El abanico crece; el núcleo no se mueve.

### 3. Maximizar lo gratuito es un principio de diseño, no un lujo

El sistema es **administrador de un recurso escaso**: las cuotas gratuitas. En toda pantalla relevante se ve cuánto queda del free tier del mes por canal. La cola chequea cuota **antes** de cada envío, no después. Un segmento que excede la cuota disponible se **bloquea**, no se avisa con un warning ignorable — porque mandar de más significa o bien error, o bien empezar a pagar sin querer.

El default siempre empuja hacia el recurso gratis:
- Email → Resend (3.000/mes gratis) antes que pagar SES.
- WhatsApp → Meta Cloud directo (1.000 conversaciones service gratis) antes que un intermediario con markup.
- Canal complementario → Telegram (ilimitado, gratis).
- Listening → stack DIY (GDELT + X API Basic + Reddit + Claude) antes que un Brandwatch de $25k/año.

> El camino fácil tiene que ser también el más barato. Pagar es siempre una decisión explícita del usuario, nunca un accidente del sistema.

### 4. Vos elegís el canal — el sistema asesora, no decide por vos

La elección del medio es **humana**. Para cada contacto y cada campaña, vos decidís por dónde comunicarte. El sistema es un **asesor informado** que pone sobre la mesa todo lo que necesitás para decidir bien:

- **Cuota restante** del canal este mes ("te quedan 1.247 emails / 312 conversaciones WA").
- **Canal preferido** inferido del contacto ("respondió 3/3 veces por WhatsApp").
- **Cooldowns** activos ("89 personas de este segmento recibieron WA hace menos de 30 días").
- **Salud de la relación** y advertencias ("25 contactos tienen health score < 40, considerá excluirlos").

Menos "magia", más control. La herramienta no rutea sola ni te oculta el porqué de nada: te da el tablero completo y vos tomás la decisión. Las únicas cosas que **no** son negociables son las reglas duras (§6).

### 5. Calidad sobre cantidad — mandar a 80 correctos vale más que a 8.000 random

La UI hace que **contactar bien se sienta mejor que contactar masivo.** Cada pantalla muestra el tamaño del segmento, la frescura del último contacto y la salud de la relación. Mandar genérico a todos es técnicamente posible, pero requiere pasos extra y advertencias. El camino fácil es el correcto: segmentar, personalizar, respetar el descanso de la gente.

> No competimos por volumen de envíos. Competimos por **tasa de respuesta** y por **relaciones que duran**.

### 6. Propósito investigativo, encuadre claro — esto define qué es y qué no es

Severo Tronador es una herramienta de **investigación social y opinión pública**: relevamientos territoriales, encuestas cuali/cuanti, intercambios con la ciudadanía. **No** es propaganda electoral, posicionamiento de candidatos ni fundraising político.

Esto no es solo un disclaimer legal — es lo que **destraba** todo el abanico de proveedores (WhatsApp/Meta, Resend, etc. prohíben uso político-electoral pero aceptan la vertical *Market Research / Survey*) y lo que mantiene a la herramienta del lado correcto de la Ley 25.326. El encuadre investigativo es parte del sentido, no un detalle.

---

## Cómo trabaja (el ciclo del sentido)

```
   1. SEGMENTAR        ¿A quién? Filtros sobre el padrón + salud de relación.
        │
   2. ELEGIR CANAL     Vos decidís el medio. El sistema muestra cuota,
        │              preferencia, cooldowns y advertencias.
   3. DISEÑAR MENSAJE  Template con variables. Propósito investigativo
        │              declarado. Opt-out siempre ofrecido.
   4. CHEQUEAR CUOTA   ¿Entra en el free tier? Si no, recortar / programar
        │              en partes / esperar reset. Nunca "mandar igual".
   5. EJECUTAR         Cola rate-limited que respeta el límite del proveedor.
        │
   6. RECOLECTAR       Respuestas via webhook o encuesta tokenizada,
        │              logueadas contra el contacto.
   7. APRENDER         La ficha de relación se actualiza: health score,
                       canal preferido, cooldown, próxima disponibilidad.
```

Cada vuelta del ciclo **deja la base de contactos más rica** que antes. Ese es el motor de la fidelización.

---

## Tres tipos de interacción

La herramienta no es solo "encuestas". Cubre un espectro de **intercambios**:

| Tipo | Qué es | Ejemplo |
|---|---|---|
| **Comunicación** | Mensaje saliente informativo o de invitación | "Foro vecinal el sábado en el Barrio Norte" |
| **Encuesta** | Preguntas estructuradas con respuestas registradas | "¿Cómo calificás el transporte público?" (1-5) |
| **Intercambio** | Conversación bidireccional, respuesta abierta | "Contanos qué mejorarías de tu barrio" → análisis cualitativo con Claude |

Los tres comparten la misma maquinaria (segmento → canal → cuota → envío → respuesta → relación). Cambia el **tipo de mensaje** y el **tipo de captura de respuesta**, no la arquitectura.

---

## Lo que NO es (por diseño)

Definir el sentido es también definir los límites:

- **No es un CRM de ventas.** No hay pipeline, ni deals, ni tareas comerciales. Es investigación, no comercial.
- **No es una herramienta de campaña electoral.** Ver pilar 6.
- **No es un blaster de spam.** El sistema empuja activamente en contra del envío masivo indiscriminado.
- **No reemplaza el listening enterprise** (Zencity/Brandwatch). Lo **complementa**: el listening descubre temas, Severo Tronador mide prevalencia preguntando directo a una muestra del padrón.

---

## North star — cómo sabemos que funciona

La herramienta cumple su sentido cuando, al final de un mes típico, se puede decir:

1. **Contactamos a las personas correctas** (segmentos chicos y precisos, no envíos masivos).
2. **No gastamos un peso de más** (nos mantuvimos dentro de los free tiers, y cuando pagamos fue una decisión consciente).
3. **La gente nos respondió** (tasa de respuesta alta porque respetamos canal preferido, cooldowns y calidad de mensaje).
4. **La relación quedó mejor que antes** (más fichas con health score sano, menos opt-outs, más canales preferidos identificados).
5. **Sumar un canal nuevo fue trivial** (un archivo + una línea, sin refactor).

Si esas cinco cosas son ciertas, Severo Tronador está haciendo lo que vino a hacer.
