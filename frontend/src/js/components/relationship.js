export function relationshipLabel(start, now = new Date()) {
  if (!start) return '恋爱开始日期待确认 · 心动的日子，慢慢收藏';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (!match) return '恋爱开始日期待确认';
  const [year, month, day] = match.slice(1).map(Number);
  const epoch = Date.UTC(year, month - 1, day);
  const parsed = new Date(epoch);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return '恋爱开始日期待确认';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  if (epoch > today) return '恋爱开始日期待确认';
  return '在一起第 ' + Math.floor((today - epoch) / 86400000) + ' 天';
}
