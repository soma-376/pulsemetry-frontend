// Completed ISO weeks, with Monday 00:00 KST boundaries.
export function completedWeeks(to: string) {
  if (to === 'now') return { from: 'now-8w/w', to: 'now/w' };
  const date = new Date(Date.parse(to) + 9 * 3600000);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const end = date.getTime() - 9 * 3600000;
  return { from: new Date(end - 56 * 86400000).toISOString(), to: new Date(end).toISOString() };
}
