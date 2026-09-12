/** Parses a DD/MM/YYYY string into a UTC Date (midnight). Throws if the format is invalid. */
export function parseDdMmYyyy(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    throw new Error("Date must be in DD/MM/YYYY format");
  }
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (
    date.getUTCFullYear() !== Number(yyyy) ||
    date.getUTCMonth() !== Number(mm) - 1 ||
    date.getUTCDate() !== Number(dd)
  ) {
    throw new Error("Date must be a valid DD/MM/YYYY date");
  }
  return date;
}
