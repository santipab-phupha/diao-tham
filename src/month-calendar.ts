/** Calendar dates use YYYY-MM-DD, independent of the browser's UTC offset. */
export function monthDays(month: string): Array<string | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const [year, number] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, number - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells: Array<string | null> = Array(firstWeekday).fill(null);
  for (let day = 1; day <= count; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthTitle(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, number - 1, 1)));
}
