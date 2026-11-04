/**
 * Formats a number as Colombian Pesos (COP) with locale-aware separators.
 *
 * WHY Intl.NumberFormat: it handles thousands separators (.) and decimal
 * separators (,) correctly for es-CO locale, which is the inverse of en-US.
 * Using string concatenation would break for edge cases like negative values.
 *
 * @param value - Amount in COP (whole pesos, not centavos)
 * @returns Formatted string like "$149.000" or "$1.431.600"
 */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Formats a compact COP value for card badges (e.g., "$149M").
 *
 * @param value - Amount in COP
 * @returns Compact string like "$149M" or "$1.4B"
 */
export function formatCOPCompact(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}
