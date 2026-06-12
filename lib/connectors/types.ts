// Modelo de conectores — ver ARCHITECTURE.md §2.
// La app no sabe de "email" o "whatsapp" en abstracto: consume conectores
// que implementan ciertas capabilities. Agregar un provider = un módulo que
// implementa `Connector` + una línea en el registry.

export type ConnectorCategory =
  | "data" // fuente de contactos (Google Sheets)
  | "outreach" // canal saliente (Email, WhatsApp, SMS, Voz, Telegram)
  | "publishing" // publicación/promoción en redes (Meta: FB/IG + ads)
  | "listening" // canal entrante (GDELT, X API, Reddit…)
  | "analysis" // procesamiento (Claude API, embeddings)
  | "auth"; // autenticación (Google OAuth)

export type ConnectorStatus =
  | "not_installed" // no agregado al sistema
  | "configuring" // agregado, faltan credenciales o test
  | "enabled" // listo y activo
  | "paused" // credenciales OK pero toggle off
  | "error" // creds expiradas / API caída
  | "quota_exhausted"; // free tier mensual agotado

export type QuotaUnit =
  | "messages"
  | "conversations"
  | "minutes"
  | "tokens"
  | "api_calls"
  | "rows";

export interface Quota {
  used: number;
  limit: number;
  unit: QuotaUnit;
  period: "day" | "month" | "rolling-30d" | "none";
  resetAt: string | null; // ISO; null = sin reset (créditos consumibles)
}

export interface Capability {
  id: string; // 'email.send', 'padron.read', 'voice.conversational_survey'
  label: string;
  costPerUnit?: number; // USD (tier pago) o 0 (free tier)
  rateLimit?: { perSecond?: number; perMinute?: number };
}

// Descriptor de un campo del formulario de configuración (modal del conector).
export type ConfigFieldType = "text" | "secret" | "email" | "url" | "textarea";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
}

export type ConfigSchema = ConfigField[];
export type Config = Record<string, string>;

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// Interfaz base que todo conector implementa.
export interface Connector {
  id: string; // 'google-sheets', 'resend', 'meta-wa-cloud'
  name: string; // 'Google Sheets'
  vendor: string; // 'Google LLC'
  category: ConnectorCategory;
  description: string; // una línea
  docsUrl: string;
  iconEmoji: string; // ícono simple para F1 (sin pipeline de assets todavía)

  capabilities: Capability[];
  configSchema: ConfigSchema;

  // lifecycle
  test(config?: Config): Promise<TestResult>;
  getStatus(config?: Config): Promise<ConnectorStatus>;
  // Cuota del proyecto (opcional; default = proyecto default).
  getQuota?(projectId?: string): Promise<Quota | null>;
}

// ── Refinamientos por categoría ───────────────────────────────────────────
// Cada categoría suma los métodos propios. F1 implementa data + auth; las
// demás quedan declaradas como contrato para las fases siguientes.

export interface Contact {
  dni: string;
  nombre: string;
  apellido: string;
  fecha_nac?: string;
  sexo?: string;
  domicilio?: string;
  barrio?: string;
  circuito?: string;
  mesa?: string;
  telefono?: string;
  email?: string;
  // Handle X (Twitter) sin "@". Permite mapear contenido específico del
  // ciudadano en /escucha vía X API. Opcional.
  x_handle?: string;
  // Grupo de contactos al que pertenece (padron.grupo_id). Permite segmentar
  // por grupo. Opcional.
  grupo_id?: string | null;
  // Afiliación política declarada/estimada (texto libre, ej. nombre de partido
  // o "independiente"). Dato sensible: solo para segmentación interna. Opcional.
  afiliacion?: string;
}

export interface DataConnector extends Connector {
  category: "data";
  readPadron(config?: Config, opts?: { limit?: number }): Promise<Contact[]>;
}

// Contratos declarados para fases futuras (F3+). No se implementan en F1.
export interface OutreachMessage {
  subject?: string;
  body: string;
  // WhatsApp pre-aprobado (Meta vertical Survey/Research). Si está, el
  // connector usa type=template en lugar de type=text — válido fuera de
  // la ventana 24h (#12 STABILIZATION).
  template?: {
    name: string;
    lang: string; // ej "es_AR"
    // Parámetros que reemplazan {{1}}, {{2}}… en el template aprobado.
    params?: string[];
  };
  // Reply-To opcional para que respuestas vuelvan al mailbox @tronador.
  // Email connector lo setea como header; canales sin reply concept
  // (SMS, voz) lo ignoran.
  replyTo?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  // Fallo transitorio (rate limit / 5xx): el cron debe reintentar con backoff
  // en vez de marcar la fila como failed permanente.
  retryable?: boolean;
}

export interface OutreachConnector extends Connector {
  category: "outreach";
  // projectId opcional (default = proyecto default) → la cuota se trackea por
  // proyecto. send-queue pasa el del envío; callers de display usan el default.
  getQuota(projectId?: string): Promise<Quota>;
  send(
    message: OutreachMessage,
    recipient: Contact,
    projectId?: string,
  ): Promise<SendResult>;
  estimateQuotaImpact(
    count: number,
    projectId?: string,
  ): Promise<{ willFit: boolean; remaining: number }>;
}

export interface ListenQuery {
  keywords: string[];
  geo?: string;
  since?: string;
  zona?: string;
  pais?: string;
  radioKm?: number | null;
  // Coordenadas explícitas seteadas con el map picker. Sobrescriben zona
  // como hint geo para X (geocode point.lat,lng,radio).
  lat?: number | null;
  lng?: number | null;
  // Feeds RSS/Atom configurados por el usuario (conector rss-medios).
  rssFeeds?: string[];
  // Handles públicos de X a monitorear (override de los handles del padrón).
  xHandles?: string[];
}

export interface ListenItem {
  source: string;
  text: string;
  url?: string;
  publishedAt?: string;
  // Autor cuando el provider lo expone (handle X, dominio GDELT, etc).
  // Se usa para rankings de "más conversan".
  author?: string;
  // Tipo de contenido (Meta CL: post|reel|comment, X: tweet|reply, etc).
  // Permite threading + métricas separadas en /escucha.
  kind?: "post" | "reel" | "comment" | "tweet" | "reply";
  // URL del post padre cuando el item es un comentario / reply. Habilita
  // agrupado threaded en el feed cuando ambos están en la misma corrida.
  parentUrl?: string;
  // Metadatos opcionales (ej. radio: { audioObject, start, end, programa } para
  // reproducir la mención). Se persiste como jsonb en listening_items.meta.
  meta?: Record<string, unknown>;
  // Connector de origen. Lo asigna la cache (al leer) o el path live (al
  // fetchear). Habilita agrupar el feed por fuente (medios/x/radio/…).
  connectorId?: string | null;
}

export interface ListeningConnector extends Connector {
  category: "listening";
  fetch(query: ListenQuery): Promise<ListenItem[]>;
}

export type AnalysisTask = "sentiment" | "coding_qualitative" | "cluster";

export interface AnalysisResult {
  task: AnalysisTask;
  output: unknown;
}

export interface AnalysisConnector extends Connector {
  category: "analysis";
  analyze(input: string | string[], task: AnalysisTask): Promise<AnalysisResult>;
}
