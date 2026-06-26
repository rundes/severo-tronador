// fetch con timeout (AbortController). Los conectores de escucha pegan a hosts
// externos fijos; sin timeout un upstream lento/hostil cuelga la función
// serverless indefinidamente. rss.ts y x-syndication ya tenían su propio timeout;
// este helper unifica el resto (gdelt, x-api, meta-*).
const DEFAULT_TIMEOUT_MS = 8000;

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  opts: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Si el caller ya pasó un signal, lo encadenamos al nuestro.
  if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
