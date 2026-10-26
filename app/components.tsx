'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DONATION_TOKENS, DONATION_WALLET, PRIZE_WALLET, SEASON_END, SPLIT } from '@/config';
import {
  classStats,
  guildShares,
  rankFor,
  type ClassedPlayer,
  type ClassKey,
  type ClassStats,
  type GuildInfo,
  type Player,
  type PlayerLevel,
  type PoolData,
  type RankedPlayer,
  type Slices,
} from '@/lib/calc';
import { fmtBrl, fmtEva, fmtInt, fmtNum, fmtPct, fmtPrice, fmtTime, fmtUsdt } from '@/lib/format';

// Valor em R$, ou '—' se a cotação estiver indisponível.
const brl = (usdt: number, pool: PoolData) => (pool.usdBrl === null ? '—' : fmtBrl(usdt * pool.usdBrl));

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="mb-4 font-pixel text-xs leading-relaxed text-gold sm:text-sm">{children}</h2>
);

function Stat({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`panel p-4 ${className}`}>
      <div className="mb-1 text-xs tracking-wide text-muted uppercase">{label}</div>
      {children}
    </div>
  );
}

export function Money({ usdt, pool, big = false }: { usdt: number; pool: PoolData; big?: boolean }) {
  return (
    <div className="tabular-nums">
      <div className={big ? 'text-2xl font-bold text-gold sm:text-3xl' : 'text-lg font-semibold text-gold'}>
        {fmtUsdt(usdt)}
      </div>
      <div className="text-xs text-muted">
        ≈ {fmtEva(usdt / pool.evaPrice)} · {brl(usdt, pool)}
      </div>
    </div>
  );
}

function Countdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return <div className="text-xl font-bold">—</div>;
  const s = Math.floor((Date.parse(SEASON_END) - now) / 1000);
  if (s <= 0) return <div className="text-xl font-bold">Season encerrada</div>;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="text-xl font-bold tabular-nums">
      {Math.floor(s / 86400)}d {pad(Math.floor((s % 86400) / 3600))}h {pad(Math.floor((s % 3600) / 60))}m{' '}
      {pad(s % 60)}s
    </div>
  );
}

export function PoolHeader({
  pool,
  slices,
  updatedAt,
  stale,
}: {
  pool: PoolData;
  slices: Slices;
  updatedAt: number;
  stale: boolean;
}) {
  const parts = [
    ['Ranking individual', SPLIT.individual, slices.individual],
    ['Guildas', SPLIT.guilds, slices.guilds],
    ['Referral', SPLIT.referral, slices.referral],
    ['Bugs aprovados', SPLIT.bugs, slices.bugs],
    ['Equipe', SPLIT.team, slices.team],
  ] as const;
  const end = new Date(SEASON_END).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Prize pool total" className="sm:col-span-2">
          <Money usdt={slices.totalUsdt} pool={pool} big />
          <p className="mt-1 text-xs text-muted">
            {fmtEva(pool.eva)} na carteira{pool.usdt > 0 && ` + ${fmtUsdt(pool.usdt)}`}
          </p>
        </Stat>
        <Stat label="Preço do EVA">
          <div className="text-xl font-bold tabular-nums">{fmtPrice(pool.evaPrice)} USDT</div>
          <div className="text-xs text-muted">
            ≈ {brl(pool.evaPrice, pool)} · 1 USDT = {brl(1, pool)}
          </div>
        </Stat>
        <Stat label="Termina em">
          <Countdown />
          <div className="text-xs text-muted">{end} (Brasília)</div>
        </Stat>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {parts.map(([label, pct, usdt]) => (
          <div key={label} className="border-2 border-line p-3">
            <div className="text-xs text-muted">
              {label} · {pct * 100}%
            </div>
            <div className="font-semibold tabular-nums">{fmtUsdt(usdt)}</div>
            <div className="text-xs text-muted tabular-nums">{brl(usdt, pool)}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {stale ? (
          <span className="text-warn">⚠ Fonte indisponível — dados de {fmtTime(updatedAt)}</span>
        ) : (
          <>Atualizado às {fmtTime(updatedAt)} · atualiza a cada 5 min</>
        )}
      </p>
    </section>
  );
}

export function PlayerSearch({
  rows,
  levels,
  pool,
  nick,
  setNick,
}: {
  rows: RankedPlayer[];
  levels: PlayerLevel[];
  pool: PoolData;
  nick: string;
  setNick: (v: string) => void;
}) {
  const q = nick.trim().toLowerCase();
  const hit = q ? rows.find((r) => r.player.toLowerCase() === q) : undefined;
  const above = hit && hit.rank > 1 ? rows[hit.rank - 2] : undefined;
  const lvl = hit && levels.find((l) => l.player === hit.player);
  const partial = q && rows.some((r) => r.player.toLowerCase().includes(q));
  return (
    <section>
      <H2>Buscar jogador</H2>
      <input
        list="nicks"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
        placeholder="Digite seu nick"
        aria-label="Nick do jogador"
        className="w-full border-2 border-line bg-panel px-3 py-2 outline-none focus:border-gold"
      />
      <datalist id="nicks">
        {rows.map((r) => (
          <option key={r.player} value={r.player} />
        ))}
      </datalist>
      {hit ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Posição">
            <div className="text-2xl font-bold">#{hit.rank}</div>
            <div className="text-xs text-muted">
              {hit.guild ?? 'sem guilda'}
              {lvl && ` · ${lvl.class} nv. ${lvl.level}`}
            </div>
          </Stat>
          <Stat label="Gold">
            <div className="text-xl font-bold tabular-nums">{fmtInt(hit.gold)}</div>
            <div className="text-xs text-muted">{fmtPct(hit.share)} do gold total</div>
          </Stat>
          <Stat label="Ganho estimado">
            <Money usdt={hit.usdt} pool={pool} />
          </Stat>
          <Stat label="Para subir uma posição">
            {above && hit.toNext !== null ? (
              <>
                <div className="text-xl font-bold tabular-nums">+{fmtInt(hit.toNext)}</div>
                <div className="text-xs text-muted">de gold para passar {above.player}</div>
              </>
            ) : (
              <div className="text-xl font-bold">Já é o #1</div>
            )}
          </Stat>
        </div>
      ) : (
        q && (
          <p className="mt-3 text-sm text-muted">
            {partial
              ? 'Escolha um nick da lista.'
              : `“${nick.trim()}” não aparece no top 100 público. Use o simulador abaixo com o seu gold.`}
          </p>
        )
      )}
    </section>
  );
}

const th = 'border-b-2 border-line px-2 py-2 text-xs whitespace-nowrap text-muted uppercase';
const td = 'px-2 py-1.5 whitespace-nowrap';
const tdName = 'px-2 py-1.5'; // nome + linha extra: pode quebrar linha para caber no celular
// No celular as tabelas ficam com poucas colunas; o resto vira uma linha menor dentro da célula.
const desk = 'hidden sm:table-cell'; // coluna só a partir de 640px
const sub = 'text-xs font-normal text-muted sm:hidden'; // linha extra só no celular

export const CLASS_INFO: Record<ClassKey, { label: string; icon: string; bar: string; border: string }> = {
  knight: { label: 'Cavaleiro', icon: '🛡️', bar: 'bg-knight', border: 'border-knight' },
  archer: { label: 'Arqueiro', icon: '🏹', bar: 'bg-archer', border: 'border-archer' },
  mage: { label: 'Mago', icon: '🔮', bar: 'bg-mage', border: 'border-mage' },
  unknown: { label: 'Desconhecida', icon: '❔', bar: 'bg-unknown', border: 'border-unknown' },
};

// Ícone com o nome da classe para leitores de tela e no hover: a cor nunca é a única pista.
const ClassIcon = ({ cls }: { cls: ClassKey }) => (
  <span role="img" aria-label={CLASS_INFO[cls].label} title={CLASS_INFO[cls].label}>
    {CLASS_INFO[cls].icon}
  </span>
);

type ColKey = 'rank' | 'levelRank' | 'player' | 'cls' | 'guild' | 'level' | 'gold' | 'share' | 'usdt';
type Col = { key: ColKey; label: ReactNode; right?: boolean; desktopOnly?: boolean };
const PLAYER_COLS: Col[] = [
  { key: 'rank', label: '#' },
  { key: 'player', label: 'Jogador' },
  { key: 'guild', label: 'Guilda', desktopOnly: true },
  { key: 'gold', label: 'Gold', right: true, desktopOnly: true },
  { key: 'share', label: '% do total', right: true, desktopOnly: true },
  { key: 'usdt', label: 'Ganho (USDT)', right: true },
];
const CLASS_COLS: Col[] = [
  // no celular só '#', para a tabela caber (a coluna '# nível' nem aparece lá)
  { key: 'rank', label: <>#<span className="hidden sm:inline"> gold</span></> },
  { key: 'levelRank', label: '# nível', desktopOnly: true },
  { key: 'player', label: 'Jogador' },
  { key: 'cls', label: 'Classe', desktopOnly: true },
  { key: 'guild', label: 'Guilda', desktopOnly: true },
  { key: 'level', label: 'Nível', right: true, desktopOnly: true },
  { key: 'gold', label: 'Gold', right: true, desktopOnly: true },
  { key: 'usdt', label: 'Ganho (USDT)', right: true },
];
const ASC_FIRST: ColKey[] = ['rank', 'levelRank', 'player', 'cls', 'guild'];

const sortValue = (r: ClassedPlayer, key: ColKey): number | string => {
  if (key === 'cls') return CLASS_INFO[r.cls].label;
  if (key === 'levelRank') return r.levelRank ?? Infinity; // fora do top de nível vai para o fim
  if (key === 'level') return r.level ?? -Infinity;
  return r[key] ?? '';
};

// Usada nas abas Jogadores (por guilda) e Classes (byClass: colunas e filtro de classe).
export function RankingTable({
  rows,
  pool,
  selected,
  outside,
  byClass = false,
}: {
  rows: ClassedPlayer[];
  pool: PoolData;
  selected: string;
  outside: number;
  byClass?: boolean;
}) {
  const cols = byClass ? CLASS_COLS : PLAYER_COLS;
  const [filter, setFilter] = useState('*'); // '*' = todos; senão a guilda ('' = sem guilda) ou a classe
  const [sort, setSort] = useState<{ key: ColKey; asc: boolean }>({ key: 'rank', asc: true });
  const guilds = [...new Set(rows.flatMap((r) => (r.guild ? [r.guild] : [])))].sort((a, b) => a.localeCompare(b));
  const options: [string, string][] = byClass
    ? (['knight', 'archer', 'mage', 'unknown'] as const).map((c) => [c, `${CLASS_INFO[c].icon} ${CLASS_INFO[c].label}`])
    : [['', 'Sem guilda'], ...guilds.map((g): [string, string] => [g, g])];
  const keep = (r: ClassedPlayer) => {
    if (filter === '*') return true;
    if (byClass) return r.cls === filter;
    return filter === '' ? !r.guild : r.guild === filter;
  };
  const shown = rows.filter(keep).sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    const c = typeof x === 'number' && typeof y === 'number' ? x - y || 0 : String(x).localeCompare(String(y));
    return sort.asc ? c : -c;
  });
  const sum = (k: 'gold' | 'share' | 'usdt') => shown.reduce((s, r) => s + r[k], 0);
  const toggle = (key: ColKey) =>
    setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: ASC_FIRST.includes(key) }));
  const sel = selected.trim().toLowerCase();
  const usdtCell = (usdt: number) => (
    <>
      {fmtNum(usdt)}
      <div className={sub}>{brl(usdt, pool)}</div>
    </>
  );
  const cell = (key: ColKey, r: ClassedPlayer): [string, ReactNode] => {
    switch (key) {
      case 'rank':
        return [r.rank <= 3 ? 'font-bold text-gold' : 'text-muted', r.rank];
      case 'levelRank':
        return ['text-muted', r.levelRank ?? '—'];
      case 'cls':
        return ['', `${CLASS_INFO[r.cls].icon} ${CLASS_INFO[r.cls].label}`];
      case 'guild':
        return ['text-muted', r.guild ?? '—'];
      case 'level':
        return ['text-muted', r.level ?? '—'];
      case 'gold':
        return ['', fmtInt(r.gold)];
      case 'share':
        return ['text-muted', fmtPct(r.share)];
      case 'usdt':
        return ['text-gold', usdtCell(r.usdt)];
      default:
        return ['', null];
    }
  };
  const foot = (key: ColKey): ReactNode => {
    if (key === 'player') return 'Total exibido';
    if (key === 'gold') return fmtInt(sum('gold'));
    if (key === 'share') return fmtPct(sum('share'));
    if (key === 'usdt') return usdtCell(sum('usdt'));
    return null;
  };
  const colClass = (c: Col) => `${c.desktopOnly ? desk : ''} ${c.right ? 'text-right' : ''}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          {byClass ? 'Classe' : 'Guilda'}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="border-2 border-line bg-bg px-2 py-1 outline-none focus:border-gold"
          >
            <option value="*">Todas</option>
            {options.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted">{shown.length} jogadores</span>
        {outside > 0 && <span className="text-warn">inclui {fmtInt(outside)} de gold fora do top 100</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={`${th} ${c.right ? 'text-right' : 'text-left'} ${c.desktopOnly ? desk : ''}`}
                  aria-sort={sort.key === c.key ? (sort.asc ? 'ascending' : 'descending') : undefined}
                >
                  <button onClick={() => toggle(c.key)} className="uppercase hover:text-gold">
                    {c.label}
                    {sort.key === c.key && (sort.asc ? ' ▲' : ' ▼')}
                  </button>
                </th>
              ))}
              <th className={`${th} ${desk} text-right`}>Ganho (R$)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.player} className={r.player.toLowerCase() === sel ? 'bg-gold/15' : 'even:bg-white/[0.03]'}>
                {cols.map((c) => {
                  if (c.key === 'player')
                    return (
                      <td key={c.key} className={tdName}>
                        <div className="font-medium">
                          {r.player}{' '}
                          {r.cls !== 'unknown' && (
                            // na aba Classes o computador já tem a coluna Classe; o ícone fica só no celular
                            <span className={byClass ? 'sm:hidden' : ''}>
                              <ClassIcon cls={r.cls} />
                            </span>
                          )}
                        </div>
                        <div className={sub}>
                          <span className="whitespace-nowrap">
                            {byClass
                              ? r.level === null
                                ? 'fora do top de nível'
                                : `nv. ${r.level}`
                              : (r.guild ?? 'sem guilda')}
                          </span>{' '}
                          · <span className="whitespace-nowrap">{fmtInt(r.gold)} gold</span>
                        </div>
                      </td>
                    );
                  const [extra, content] = cell(c.key, r);
                  return (
                    <td key={c.key} className={`${td} ${colClass(c)} ${extra}`}>
                      {content}
                    </td>
                  );
                })}
                <td className={`${td} ${desk} text-right`}>{brl(r.usdt, pool)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              {cols.map((c) => (
                <td key={c.key} className={`${td} ${colClass(c)} ${c.key === 'usdt' ? 'text-gold' : ''}`}>
                  {foot(c.key)}
                </td>
              ))}
              <td className={`${td} ${desk} text-right`}>{brl(sum('usdt'), pool)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export function GuildTable({
  players,
  guilds,
  guildPool,
  pool,
}: {
  players: Player[];
  guilds: GuildInfo[];
  guildPool: number;
  pool: PoolData;
}) {
  const [basis, setBasis] = useState<'gold' | 'gp'>('gp'); // GP é o que ordena o ranking oficial de guildas
  const rows = guildShares(players, guilds, guildPool, basis);
  const radio = (value: 'gold' | 'gp', label: string) => (
    <label className="flex items-center gap-2">
      <input type="radio" name="basis" checked={basis === value} onChange={() => setBasis(value)} className="accent-gold" />
      {label}
    </label>
  );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="text-muted">Dividir os {SPLIT.guilds * 100}% ({fmtUsdt(guildPool)}) por:</span>
        {radio('gp', 'GP do ranking oficial de guildas')}
        {radio('gold', 'gold dos membros no top 100')}
      </div>
      <p className="mb-3 text-xs text-warn">
        Suposição: a regra oficial não detalha como a fatia de guildas é distribuída.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Guilda</th>
              <th className={`${th} ${desk} text-right`}>Nível</th>
              <th className={`${th} ${desk} text-right`}>GP</th>
              <th className={`${th} ${desk} text-right`}>Membros</th>
              <th className={`${th} ${desk} text-right`}>No top 100</th>
              <th className={`${th} ${desk} text-right`}>Gold (top 100)</th>
              <th className={`${th} ${desk} text-right`}>% da fatia</th>
              <th className={`${th} text-right`}>Ganho (USDT)</th>
              <th className={`${th} ${desk} text-right`}>Ganho (R$)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.guild} className="even:bg-white/[0.03]">
                <td className={tdName}>
                  <div className="font-medium">{g.guild}</div>
                  <div className={sub}>
                    <span className="whitespace-nowrap">
                      {basis === 'gp' ? `${g.gp === undefined ? '—' : fmtInt(g.gp)} GP` : `${g.topMembers} no top 100`}
                    </span>{' '}
                    ·{' '}
                    <span className="whitespace-nowrap">{fmtPct(g.share)} da fatia</span>
                  </div>
                </td>
                <td className={`${td} ${desk} text-right text-muted`}>{g.level ?? '—'}</td>
                <td className={`${td} ${desk} text-right text-muted`}>{g.gp === undefined ? '—' : fmtInt(g.gp)}</td>
                <td className={`${td} ${desk} text-right text-muted`}>{g.members ?? '—'}</td>
                <td className={`${td} ${desk} text-right`}>{g.topMembers}</td>
                <td className={`${td} ${desk} text-right`}>{fmtInt(g.topGold)}</td>
                <td className={`${td} ${desk} text-right text-muted`}>{fmtPct(g.share)}</td>
                <td className={`${td} text-right text-gold`}>
                  {fmtNum(g.usdt)}
                  <div className={sub}>{brl(g.usdt, pool)}</div>
                </td>
                <td className={`${td} ${desk} text-right`}>{brl(g.usdt, pool)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Barras horizontais em CSS, uma por classe. Nome, ícone e valor ficam sempre visíveis:
// a cor identifica a classe, mas nunca é a única pista.
function ClassBars({ title, items }: { title: string; items: { cls: ClassKey; value: number; label: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{title}</figcaption>
      <div className="space-y-2">
        {items.map((i) => (
          <div
            key={i.cls}
            title={`${CLASS_INFO[i.cls].label}: ${i.label}`}
            className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm"
          >
            <span className="whitespace-nowrap">
              <span aria-hidden>{CLASS_INFO[i.cls].icon}</span> {CLASS_INFO[i.cls].label}
            </span>
            <div className="h-3 bg-white/[0.04]">
              <div className={`h-3 rounded-r-[4px] ${CLASS_INFO[i.cls].bar}`} style={{ width: `${(i.value / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums whitespace-nowrap">{i.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

const fmtLevel = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function ClassCard({ s, place, pool }: { s: ClassStats; place: number; pool: PoolData }) {
  const info = CLASS_INFO[s.cls];
  const money = (usdt: number) => (
    <>
      {fmtNum(usdt)}
      <div className="text-xs font-normal text-muted">{brl(usdt, pool)}</div>
    </>
  );
  return (
    <div className="panel space-y-3 p-4">
      <div className={`-mx-4 -mt-4 h-1.5 ${info.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold">
          <span aria-hidden>{info.icon}</span> {info.label}
        </h3>
        <span className="font-pixel text-[10px] text-gold">{place}º</span>
      </div>
      <p className="text-xs text-muted">
        {s.goldPlayers} no top 100 de gold · {s.levelPlayers} no top 100 de nível
      </p>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-muted uppercase">
            <th />
            <th className="pb-1 text-right font-normal">Total</th>
            <th className="pb-1 text-right font-normal text-gold">Por jogador</th>
          </tr>
        </thead>
        <tbody className="align-top">
          <tr>
            <td className="py-1 text-muted">
              Ganho
              <div className="text-xs">USDT</div>
            </td>
            <td className="py-1 text-right font-semibold text-gold">{money(s.usdt)}</td>
            <td className="bg-gold/5 py-1 pr-1 text-right font-semibold">{money(s.avgUsdt)}</td>
          </tr>
          <tr>
            <td className="py-1 text-muted">Gold</td>
            <td className="py-1 text-right">
              {fmtInt(s.gold)}
              <div className="text-xs text-muted">{fmtPct(s.goldShare)} do top 100</div>
            </td>
            <td className="bg-gold/5 py-1 pr-1 text-right">{fmtInt(s.avgGold)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted">
        Nível médio <strong className="text-ink">{fmtLevel(s.avgLevel)}</strong> · máximo{' '}
        <strong className="text-ink">{fmtLevel(s.maxLevel)}</strong>
      </p>
      <p className="text-xs text-muted">
        Melhor jogador:{' '}
        {s.best ? (
          <>
            <strong className="text-ink">{s.best.player}</strong> · nv. {fmtLevel(s.best.level)} · {fmtInt(s.best.gold)}{' '}
            gold
          </>
        ) : (
          '—'
        )}
      </p>
    </div>
  );
}

export function ClassesTab({
  players,
  levels,
  pool,
  selected,
  outside,
}: {
  players: ClassedPlayer[];
  levels: PlayerLevel[];
  pool: PoolData;
  selected: string;
  outside: number;
}) {
  const stats = classStats(players, levels);
  const known = stats.filter((s) => s.cls !== 'unknown');
  const unknown = stats[stats.length - 1];
  const total = stats.reduce((sum, s) => sum + s.usdt, 0);
  return (
    <div className="space-y-6">
      <div className="space-y-1 text-xs text-warn">
        <p>
          Os dados públicos cobrem só o top 100 de gold e o top 100 de nível: estas estatísticas representam os
          jogadores do topo, não o servidor inteiro.
        </p>
        <p>“Classe desconhecida” = jogadores do top 100 de gold que estão fora do top 100 de nível.</p>
        {levels.length === 0 && (
          <p>⚠ Ranking de nível indisponível agora: todos aparecem como classe desconhecida.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {known.map((s, i) => (
          <ClassCard key={s.cls} s={s} place={i + 1} pool={pool} />
        ))}
      </div>

      <div className="panel p-4 text-sm">
        <div className={`-mx-4 -mt-4 mb-3 h-1 ${CLASS_INFO.unknown.bar}`} />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-bold">
            <span aria-hidden>{CLASS_INFO.unknown.icon}</span> Classe desconhecida
          </span>
          <span className="text-muted">{unknown.goldPlayers} jogadores do top de gold</span>
          <span className="tabular-nums">
            {fmtInt(unknown.gold)} gold ({fmtPct(unknown.goldShare)})
          </span>
          <span className="tabular-nums">
            <span className="font-semibold text-gold">{fmtUsdt(unknown.usdt)}</span>{' '}
            <span className="text-muted">{brl(unknown.usdt, pool)}</span>
          </span>
        </div>
        <p className="mt-2 text-xs text-muted">
          Soma das 4: <span className="text-ink">{fmtUsdt(total)}</span>, o mesmo total do ranking individual na aba
          Jogadores.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <ClassBars
          title="Jogadores por classe (top 100 de nível)"
          items={known.map((s) => ({ cls: s.cls, value: s.levelPlayers, label: String(s.levelPlayers) }))}
        />
        <ClassBars
          title="Gold médio por jogador (top 100 de gold)"
          items={known.map((s) => ({ cls: s.cls, value: s.avgGold, label: fmtInt(s.avgGold) }))}
        />
      </div>

      <div>
        <h3 className="mb-3 font-pixel text-[10px] leading-relaxed text-gold sm:text-xs">Jogadores por classe</h3>
        <RankingTable rows={players} pool={pool} selected={selected} outside={outside} byClass />
      </div>
    </div>
  );
}

export function Simulator({
  players,
  perGold,
  pool,
  top100,
  outside,
  setOutside,
}: {
  players: Player[];
  perGold: number;
  pool: PoolData;
  top100: number;
  outside: number;
  setOutside: (v: number) => void;
}) {
  const [gold, setGold] = useState(1_000_000);
  const pos = rankFor(players, gold);
  // ponytail: teto do slider = 2× o gold do top 100; aumente se fizer sentido.
  const max = Math.max(1, Math.round(top100 * 2));
  return (
    <section className="panel space-y-6 p-4 sm:p-6">
      <H2>Simulador</H2>
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Se eu tiver este gold:
          <input
            type="number"
            min={0}
            step={1000}
            value={gold}
            onChange={(e) => setGold(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full border-2 border-line bg-bg px-3 py-2 tabular-nums outline-none focus:border-gold"
          />
          <span className="text-xs text-muted">{fmtInt(gold)} GOLD</span>
        </label>
        <div>
          <Money usdt={gold * perGold} pool={pool} big />
          <p className="text-xs text-muted">
            ficaria em #{pos}
            {pos > 100 && ' (fora do top 100 público)'}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <label htmlFor="outside" className="block text-sm">
          Gold de jogadores fora do top 100: <strong className="text-gold">{fmtInt(outside)}</strong>
        </label>
        <input
          id="outside"
          type="range"
          min={0}
          max={max}
          step={Math.max(1, Math.round(max / 1000))}
          value={outside}
          onChange={(e) => setOutside(Number(e.target.value))}
          className="w-full accent-gold"
        />
        <p className="text-xs text-muted">
          Afeta todos os valores da página. Gold total considerado: {fmtInt(top100 + outside)} ({fmtInt(top100)} do
          top 100 + {fmtInt(outside)} fora dele).
        </p>
      </div>
    </section>
  );
}

export function Disclaimers() {
  return (
    <footer id="avisos" className="panel space-y-3 p-4 text-sm text-muted sm:p-6">
      <H2>Avisos</H2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong className="text-ink">Site não oficial</strong>, sem vínculo com a Ever Magic.
        </li>
        <li>
          O ranking público mostra só o top 100, então o gold total está subestimado e os valores exibidos tendem a
          ser <strong className="text-ink">maiores</strong> que os reais.
        </li>
        <li>
          Ainda não está confirmado se conta o saldo final de GOLD ou o GOLD gerado na season, nem se os 75% são
          proporcionais ou por posição.
        </li>
        <li>Valores em EVA variam com o preço do token. Não é garantia de prêmio nem recomendação de investimento.</li>
      </ul>
      <p className="text-xs">
        Fontes: ranking e preço do EVA em na-bridge.evermagic.io (os mesmos do site oficial); saldo da carteira{' '}
        <a
          href={`https://arbiscan.io/address/${PRIZE_WALLET}`}
          target="_blank"
          rel="noreferrer"
          className="text-gold underline"
        >
          {PRIZE_WALLET.slice(0, 6)}…{PRIZE_WALLET.slice(-4)}
        </a>{' '}
        lido direto na Arbitrum; cotação USDT/BRL da Coinbase. Referral e bugs: só o total da fatia, sem dados por
        jogador.
      </p>
      <Donation />
    </footer>
  );
}

function Donation() {
  const [copied, setCopied] = useState(false);
  if (!DONATION_WALLET) return null;
  const copy = () =>
    navigator.clipboard
      .writeText(DONATION_WALLET)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {}); // sem clipboard: o endereço continua selecionável
  return (
    <div className="space-y-1 border-t-2 border-line pt-3 text-xs">
      <p>
        <strong className="text-gold">Apoie a calculadora:</strong> doações em {DONATION_TOKENS}, somente pela rede
        Arbitrum One. Vão para quem mantém o site (não para a Ever Magic nem para a prize pool) e não dão vantagem em
        troca.
      </p>
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
        <code className="break-all text-ink select-all">{DONATION_WALLET}</code>
        <button
          onClick={copy}
          aria-live="polite"
          className="shrink-0 border border-gold px-2 py-0.5 text-gold hover:bg-gold/10"
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

export function StickyNotice() {
  return (
    <a
      href="#avisos"
      className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-gold-dim bg-bg/95 px-4 py-2 text-center text-xs text-gold backdrop-blur"
    >
      ⚠ Site não oficial · estimativa que tende a ficar acima do real · ver avisos
    </a>
  );
}
