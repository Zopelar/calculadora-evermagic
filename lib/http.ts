import { CACHE_SECONDS, USER_AGENT } from '../config';

// A CDN da Vercel segura a resposta (5 min por padrão): as fontes não são chamadas a cada visita.
export const cacheHeaders = (seconds = CACHE_SECONDS) => ({
  'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=60`,
});
export const CACHE_HEADERS = cacheHeaders();

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const store = new Map<string, { at: number; data: unknown }>();
const failedAt = new Map<string, number>();
const RETRY_MS = 60_000; // depois de uma falha, só tenta a fonte de novo após 1 min

// ponytail: cache em memória por instância, sem dedupe de chamadas simultâneas.
// Se precisar compartilhar entre instâncias ou guardar histórico: Vercel KV / Upstash.
export async function cached<T>(key: string, load: () => Promise<T>, ttlSeconds = CACHE_SECONDS) {
  const hit = store.get(key) as { at: number; data: T } | undefined;
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return { ...hit, stale: false };
  // Freio: fonte que acabou de falhar (ex.: 429) não é chamada a cada visita.
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_MS) {
    if (hit) return { ...hit, stale: true };
    throw new Error(`[${key}] fonte falhou há menos de 1 min; aguardando`);
  }
  try {
    const entry = { at: Date.now(), data: await load() };
    store.set(key, entry);
    failedAt.delete(key);
    return { ...entry, stale: false };
  } catch (err) {
    failedAt.set(key, Date.now());
    if (!hit) throw err;
    console.error(`[${key}] fonte falhou, servindo cache de ${new Date(hit.at).toISOString()}`, err);
    return { ...hit, stale: true };
  }
}
