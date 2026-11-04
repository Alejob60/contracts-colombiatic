/**
 * Contracts PRO Licitador pricing — source of truth for the frontend.
 *
 * All COP amounts are in whole pesos (not centavos).
 * `copCents` is the Wompi-compatible value (COP × 100).
 *
 * WHY a single plan: the MVP validates a single "PRO Licitador" tier before
 * introducing a freemium funnel. The freemium gate (3 free searches, blurred
 * fields) is enforced client-side with middleware + server-side in the API.
 */

/** Monthly price in COP — $149.000/mes */
const MONTHLY_COP = 149_000;

/** Annual total in COP — 20% off monthly × 12 */
const ANNUAL_DISCOUNT_PERCENT = 20;
const ANNUAL_COP = Math.round(MONTHLY_COP * 12 * (1 - ANNUAL_DISCOUNT_PERCENT / 100));

/** Monthly equivalent when paying annually */
const ANNUAL_MONTHLY_EQUIVALENT = Math.round(ANNUAL_COP / 12);

/** Wompi multiplier: COP pesos → COP centavos */
const WOMPI_CENTAVOS_MULTIPLIER = 100;

export const CONTRACTS_PRICING = {
  plan: 'PRO_LICITADOR',
  slug: 'pro-licitador',
  name: 'Plan PRO Licitador',
  tagline: 'Encuentra, evalúa y gana licitaciones con IA',
  prices: {
    monthly: {
      cop: MONTHLY_COP,
      copCents: MONTHLY_COP * WOMPI_CENTAVOS_MULTIPLIER,
      label: '$149.000/mes',
    },
    yearly: {
      cop: ANNUAL_COP,
      copCents: ANNUAL_COP * WOMPI_CENTAVOS_MULTIPLIER,
      monthlyEquivalent: ANNUAL_MONTHLY_EQUIVALENT,
      label: `$${ANNUAL_COP.toLocaleString('es-CO')}/año`,
      discount: ANNUAL_DISCOUNT_PERCENT,
    },
  },
  currency: 'COP' as const,
  features: [
    'Búsquedas ilimitadas en SECOP II',
    'Resultados completos con enlaces directos',
    'Alertas WhatsApp y email (>80% coincidencia)',
    'Carga de documentos corporativos para RAG',
    'Evaluador IA de factibilidad y riesgos',
    'Checklist de habilitación automático',
    'Matriz de riesgos por proceso',
    'Red de consorcios B2B',
  ],
  freemium: {
    /** Number of free searches before requiring subscription */
    maxFreeSearches: 3,
    /** Fields blurred for non-subscribers */
    blurredFields: ['descripcion', 'urlSecop', 'precioBase', 'matchScore'],
  },
} as const;

export type BillingCycle = 'MONTHLY' | 'YEARLY';
