export function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
  }).format(value);
}
