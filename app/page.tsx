'use client';

import { useEffect, useState } from 'react';
import {
  poolSlices,
  rankPlayers,
  totalGold,
  valuePerGold,
  type GuildInfo,
  type Player,
  type PlayerLevel,
  type PoolData,
} from '@/lib/calc';
import {
  Disclaimers,
  GuildTable,
  PlayerSearch,
  PoolHeader,
  RankingTable,
  Simulator,
  StickyNotice,
} from './components';

type Fetched = { updatedAt: number; stale: boolean };
type RankingRes = Fetched & { players: Player[]; guilds: GuildInfo[]; levels: PlayerLevel[] };
type PoolRes = Fetched & PoolData;

const REFRESH_MS = 5 * 60_000; // mesmo intervalo do cache do servidor

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export default function Home() {
  const [ranking, setRanking] = useState<RankingRes | null>(null);
  const [pool, setPool] = useState<PoolRes | null>(null);
  const [failed, setFailed] = useState(false);
  const [outside, setOutside] = useState(0);
  const [nick, setNick] = useState('');
  const [tab, setTab] = useState<'players' | 'guilds'>('players');

  useEffect(() => {
    // Só busca com a aba visível e no máximo a cada 5 min. Aba em segundo plano não gera
    // requisição; ao voltar para ela, atualiza na hora se o dado tiver mais de 5 min.
    // Em caso de falha, mantém o último dado na tela e mostra o aviso de horário.
    let last = 0;
    const load = () => {
      if (document.hidden || Date.now() - last < REFRESH_MS) return;
      last = Date.now();
      setFailed(false);
      getJson<RankingRes>('/api/ranking').then(setRanking).catch(() => setFailed(true));
      getJson<PoolRes>('/api/pool').then(setPool).catch(() => setFailed(true));
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
  const goldTotal = top100 + outside;
  const perGold = slices ? valuePerGold(slices.individual, goldTotal) : 0;
  const rows = ranking && slices ? rankPlayers(ranking.players, slices.individual, goldTotal) : [];

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
              updatedAt={Math.min(ranking.updatedAt, pool.updatedAt)}
              stale={ranking.stale || pool.stale || failed}
            />
            <PlayerSearch rows={rows} levels={ranking.levels} pool={pool} nick={nick} setNick={setNick} />
            <section className="panel p-4 sm:p-6">
              <div role="tablist" className="mb-4 flex gap-2">
                {(['players', 'guilds'] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`border-2 px-3 py-2 font-pixel text-[10px] sm:text-xs ${
                      tab === t ? 'border-gold bg-gold/10 text-gold' : 'border-line text-muted hover:text-ink'
                    }`}
                  >
                    {t === 'players' ? 'Jogadores' : 'Guildas'}
                  </button>
                ))}
              </div>
              {tab === 'players' ? (
                <RankingTable rows={rows} pool={pool} selected={nick} outside={outside} />
              ) : (
                <GuildTable players={ranking.players} guilds={ranking.guilds} guildPool={slices.guilds} pool={pool} />
              )}
            </section>
            <Simulator
              players={ranking.players}
              perGold={perGold}
              pool={pool}
              top100={top100}
              outside={outside}
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
