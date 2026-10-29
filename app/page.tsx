'use client';

import { useEffect, useState } from 'react';
import { RANKING_LEVEL_URL } from '@/config';
import {
  estimateOutside,
  joinLevels,
  poolSlices,
  rankPlayers,
  toPlayerLevel,
  totalGold,
  valuePerGold,
  type GuildInfo,
  type Player,
  type PlayerLevel,
  type PoolData,
} from '@/lib/calc';
import {
  ClassesTab,
  Disclaimers,
  GuildTable,
  PlayerSearch,
  PoolComposition,
  PoolHeader,
  RankingTable,
  Simulator,
  StickyNotice,
  type CompositionRes,
} from './components';

type Fetched = { updatedAt: number; stale: boolean };
type RankingRes = Fetched & {
  players: Player[];
  guilds: GuildInfo[];
  levels: PlayerLevel[];
  sameSince?: number; // ranking de gold igual desde (ver lib/http.ts)
  changedAfter?: number | null;
};
type PoolRes = Fetched & PoolData;

const REFRESH_MS = 5 * 60_000; // mesmo intervalo do cache do servidor

type Tab = 'players' | 'guilds' | 'classes';
const TABS: [Tab, string][] = [
  ['players', 'Jogadores'],
  ['guilds', 'Guildas'],
  ['classes', 'Classes'],
];

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// O ranking de nível às vezes trava para o servidor da Vercel, mas responde ao navegador (a fonte libera
// CORS). Se o servidor vier sem ele, a página busca direto na fonte; se também falhar, segue sem classes.
async function getRanking(): Promise<RankingRes> {
  const r = await getJson<RankingRes>('/api/ranking');
  if (r.levels.length > 0) return r;
  const levels = await getJson<{ ranking?: PlayerLevel[] }>(RANKING_LEVEL_URL, { signal: AbortSignal.timeout(5_000) })
    .then(({ ranking }) => (Array.isArray(ranking) ? ranking.map(toPlayerLevel) : []))
    .catch(() => []);
  return { ...r, levels };
}

export default function Home() {
  const [ranking, setRanking] = useState<RankingRes | null>(null);
  const [pool, setPool] = useState<PoolRes | null>(null);
  const [failed, setFailed] = useState(false);
  const [comp, setComp] = useState<CompositionRes | null>(null);
  const [compFailed, setCompFailed] = useState(false);
  const [outside, setOutside] = useState<number | null>(null); // null = estimativa on-chain (provável)
  const [nick, setNick] = useState('');
  const [tab, setTab] = useState<Tab>('players');

  useEffect(() => {
    // Só busca com a aba visível e no máximo a cada 5 min. Aba em segundo plano não gera
    // requisição; ao voltar para ela, atualiza na hora se o dado tiver mais de 5 min.
    // Em caso de falha, mantém o último dado na tela e mostra o aviso de horário.
    let last = 0;
    const load = () => {
      if (document.hidden || Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      setFailed(false);
      getRanking().then(setRanking).catch(() => setFailed(true));
      getJson<PoolRes>('/api/pool').then(setPool).catch(() => setFailed(true));
      // complementar e mais lenta na 1ª leitura: a página não espera por ela
      getJson<CompositionRes>('/api/composition')
        .then((c) => {
          setComp(c);
          setCompFailed(false);
        })
        .catch(() => setCompFailed(true));
    };
    load();
    const id = setInterval(load, 60_000); // checagem barata; a requisição só sai quando passa dos 5 min
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  const slices = pool && poolSlices(pool);
  const top100 = ranking ? totalGold(ranking.players) : 0;
  // Faixa pelos passes vendidos on-chain; sem a composição, cai no cálculo de antes (só o top 100).
  const estimate =
    comp && ranking && slices ? estimateOutside(comp.passes.count, ranking.players, slices.individual) : null;
  const band = estimate && estimate.payingOutside > 0 ? estimate.perGold : null;
  const outsideGold = outside ?? estimate?.outside.likely ?? 0;
  const goldTotal = top100 + outsideGold;
  const perGold = slices ? valuePerGold(slices.individual, goldTotal) : 0;
  const rows = ranking && slices ? rankPlayers(ranking.players, slices.individual, goldTotal) : [];
  const classed = ranking ? joinLevels(rows, ranking.levels) : []; // ranking de gold + classe/nível

  return (
    <>
      <main className="mx-auto max-w-6xl space-y-8 px-4 pt-8 pb-24">
        <header className="space-y-3 text-center">
          <h1 className="font-pixel text-lg leading-relaxed text-gold [text-shadow:3px_3px_0_#000] sm:text-2xl">
            EVERMAGIC
            <br />
            PRIZE POOL
          </h1>
          <p className="text-sm text-muted">Season 0 Alpha · quanto cada jogador ganharia se a season acabasse agora</p>
        </header>

        {!ranking || !pool || !slices ? (
          <p className="panel p-6 text-center text-sm text-muted">
            {failed ? 'Não foi possível carregar os dados. Tente de novo em alguns minutos.' : 'Carregando…'}
          </p>
        ) : (
          <>
            <PoolHeader
              pool={pool}
              slices={slices}
              times={{
                rankingSince: ranking.sameSince ?? ranking.updatedAt,
                rankingChangedAfter: ranking.changedAfter ?? null,
                lastPurchaseAt: comp?.lastPurchaseAt ?? null,
              }}
              updatedAt={Math.min(ranking.updatedAt, pool.updatedAt)}
              stale={ranking.stale || pool.stale || failed}
            />
            <PoolComposition comp={comp} failed={compFailed} estimate={estimate} pool={pool} auto={outside === null} />
            <PlayerSearch rows={rows} levels={ranking.levels} pool={pool} band={band} nick={nick} setNick={setNick} />
            <section className="panel p-4 sm:p-6">
              <div role="tablist" className="mb-4 flex flex-wrap gap-2">
                {TABS.map(([t, label]) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`border-2 px-2 py-2 font-pixel text-[10px] max-[380px]:text-[9px] sm:px-3 sm:text-xs ${
                      tab === t ? 'border-gold bg-gold/10 text-gold' : 'border-line text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'players' && (
                <RankingTable rows={classed} pool={pool} band={band} selected={nick} outside={outsideGold} />
              )}
              {tab === 'guilds' && (
                <GuildTable players={ranking.players} guilds={ranking.guilds} guildPool={slices.guilds} pool={pool} />
              )}
              {tab === 'classes' && (
                <ClassesTab
                  players={classed}
                  levels={ranking.levels}
                  pool={pool}
                  band={band}
                  selected={nick}
                  outside={outsideGold}
                />
              )}
            </section>
            <Simulator
              players={ranking.players}
              perGold={perGold}
              pool={pool}
              band={band}
              estimate={estimate}
              top100={top100}
              outside={outsideGold}
              auto={outside === null}
              setOutside={setOutside}
            />
          </>
        )}

        <Disclaimers />
      </main>
      <StickyNotice />
    </>
  );
}
