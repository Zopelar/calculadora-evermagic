// A API do ranking não informa quando ele muda. O servidor compara as leituras (lib/http.ts), mas o cache
// é em memória: uma instância recém-iniciada não viu a mudança. A aba guarda a última leitura que recebeu
// e junta as duas visões.

// A fonte mudou depois de `after` (última leitura com o conteúdo anterior; null = não visto) e até `since`
// (1ª leitura com o conteúdo atual). `at` = leitura mais recente; `sig` = o conteúdo, para comparar.
export type Reading = { sig: string; at: number; since: number; after: number | null };

export function trackChange(prev: Reading | null, next: Reading): Reading {
  if (!prev) return next;
  const changed = prev.sig !== next.sig;
  // Conteúdo novo: a leitura anterior desta aba ainda tinha o antigo, então a mudança veio depois dela.
  // Mesmo conteúdo: é a mesma mudança vista por duas leituras; fica a janela mais estreita.
  const afters = [changed ? prev.at : prev.after, next.after].filter((t): t is number => t !== null);
  const after = afters.length ? Math.max(...afters) : null;
  const since = changed ? next.since : Math.min(prev.since, next.since);
  // leituras contraditórias (ex.: fonte com réplicas defasadas): fica só o que o servidor disse
  if (after !== null && after > since) return next;
  return { ...next, since, after };
}
