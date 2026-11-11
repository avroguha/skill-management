// cmdk's default fuzzy match finds "Helm" inside "staKEHoLder Management". Pickers
// use a plain case-insensitive substring match instead, so what you see is what you typed.
export function substringFilter(value: string, search: string): number {
  return value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0;
}
