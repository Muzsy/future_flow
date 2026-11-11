export function addMonths(date: string, count: number): string {
  const original = new Date(`${date}T00:00:00.000Z`);
  const day = original.getUTCDate();
  original.setUTCDate(1);
  original.setUTCMonth(original.getUTCMonth() + count);
  const lastDay = new Date(
    Date.UTC(original.getUTCFullYear(), original.getUTCMonth() + 1, 0),
  ).getUTCDate();
  original.setUTCDate(Math.min(day, lastDay));
  return original.toISOString().slice(0, 10);
}
