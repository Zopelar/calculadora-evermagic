// Formatação no padrão brasileiro (1.234.567,89).
const nf = (digits: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const int = nf(0);
const two = nf(2);
const four = nf(4);
const six = nf(6);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtInt = (n: number) => int.format(n);
export const fmtNum = (n: number) => two.format(n);
export const fmtUsdt = (n: number) => `${two.format(n)} USDT`;
export const fmtEva = (n: number) => `${four.format(n)} EVA`;
export const fmtPrice = (n: number) => six.format(n);
export const fmtBrl = (n: number) => brl.format(n);
export const fmtPct = (fraction: number) => `${two.format(fraction * 100)}%`;
export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
// Tempo decorrido: "agora", "há 8 min", "há 2 h 5 min", "há 3 d".
export function fmtAgo(ms: number, now: number) {
  const min = Math.max(0, Math.floor((now - ms) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  return `há ${Math.floor(h / 24)} d`;
}
