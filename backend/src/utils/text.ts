// Every user-typed text field in this app (names, addresses, notes, email — but never a
// password hash, encrypted ciphertext, file path/URL, ack number, or enum value) is stored in
// uppercase, both going forward and retroactively (see the one-off migration script this was
// written for). Login lookups don't depend on this — see auth.controller.ts's case-insensitive
// email matching — so this is purely a display/data-consistency convention, not a security one.
export function toUpper<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined) return value;
  return value.toUpperCase() as T;
}
