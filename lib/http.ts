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

// at = última leitura bem-sucedida. sameSince = 1ª leitura com o conteúdo atual. changedAfter = última
// leitura com o conteúdo anterior: a fonte mudou entre changedAfter e sameSince. changedAfter null = ainda
// não vimos mudar desde que a instância subiu (o conteúdo é o mesmo desde pelo menos sameSince).
type Entry<T> = { at: number; data: T; sig: string; sameSince: number; changedAfter: number | null };
const store = new Map<string, Entry<unknown>>();
const failedAt = new Map<string, number>();
const RETRY_MS = 60_000; // depois de uma falha, só tenta a fonte de novo após 1 min

const view = <T>({ at, data, sameSince, changedAfter }: Entry<T>, stale: boolean) => ({
  at,
  data,
  sameSince,
  changedAfter,
  stale,
});

// ponytail: cache em memória por instância, sem dedupe de chamadas simultâneas.
// Se precisar compartilhar entre instâncias ou guardar histórico: Vercel KV / Upstash.
export async function cached<T>(key: string, load: () => Promise<T>, ttlSeconds = CACHE_SECONDS) {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return view(hit, false);
  // Freio: fonte que acabou de falhar (ex.: 429) não é chamada a cada visita.
  if (Date.now() - (failedAt.get(key) ?? 0) < RETRY_MS) {
    if (hit) return view(hit, true);
    throw new Error(`[${key}] fonte falhou há menos de 1 min; aguardando`);
  }
  try {
    const data = await load();
    const at = Date.now();
    const sig = JSON.stringify(data); // tudo que passa por aqui já vira JSON na resposta
    const same = hit?.sig === sig;
    const entry: Entry<T> = {
      at,
      data,
      sig,
      sameSince: same ? hit.sameSince : at,
      changedAfter: same ? hit.changedAfter : (hit?.at ?? null),
    };
    store.set(key, entry);
    failedAt.delete(key);
    return view(entry, false);
  } catch (err) {
    failedAt.set(key, Date.now());
    if (!hit) throw err;
    console.error(`[${key}] fonte falhou, servindo cache de ${new Date(hit.at).toISOString()}`, err);
    return view(hit, true);
  }
}
