/**
 * SECOP II contract modalities.
 *
 * WHY these exact strings: they match the `modalidadContratacion` values
 * returned by the Colombia Compra Eficiente SECOP II open-data API.
 * Changing them breaks filter matching against the backend.
 */

export interface Modalidad {
  /** Machine-readable key used in API query params */
  readonly key: string;
  /** Human-readable label for the UI */
  readonly label: string;
  /** Short description for tooltip/help text */
  readonly description: string;
}

export const MODALIDADES: readonly Modalidad[] = [
  {
    key: 'licitacion-publica',
    label: 'Licitación Pública',
    description: 'Procesos de contratación abiertos para cualquier proponente que cumpla los requisitos.',
  },
  {
    key: 'seleccion-abreviada',
    label: 'Selección Abreviada',
    description: 'Procesos simplificados para bienes y servicios de características técnicas uniformes.',
  },
  {
    key: 'concurso-meritos',
    label: 'Concurso de Méritos',
    description: 'Selección basada en la calidad técnica de la propuesta, típico de consultoría.',
  },
  {
    key: 'contratacion-directa',
    label: 'Contratación Directa',
    description: 'Contratación sin pluralidad de oferentes, justificada por causales legales específicas.',
  },
  {
    key: 'minima-cuantia',
    label: 'Mínima Cuantía',
    description: 'Procesos de menor valor ($0 – ~$37M COP según presupuesto de la entidad).',
  },
] as const;

export type ModalidadKey = typeof MODALIDADES[number]['key'];
