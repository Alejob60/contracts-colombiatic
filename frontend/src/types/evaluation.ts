/**
 * Bid evaluation domain types — Sprint 5.
 *
 * Mirrors the backend ``EvaluationAnalysis`` Pydantic schema and the
 * ``bid_evaluations`` table shape. Kept separate from secop.ts because
 * evaluations are a distinct bounded context (PRO-only, AI-generated).
 */

// ── Feasibility verdicts ─────────────────────────────────────────────────

export type Feasibility = 'VIABLE' | 'PARCIAL' | 'NO_VIABLE' | 'DATOS_INSUFICIENTES';

export type EvalStatus = 'ANALYZING' | 'COMPLETED' | 'FAILED';

export type RiskSeverity = 'ALTA' | 'MEDIA' | 'BAJA';

export type CompetitionLevel = 'BAJA' | 'MEDIA' | 'ALTA';

// ── Analysis sub-objects ─────────────────────────────────────────────────

export interface RiskItem {
  category: string;
  severity: RiskSeverity;
  description: string;
  recommendation: string;
}

export interface QualItem {
  requirement: string;
  met: boolean;
  evidence: string | null;
  gap: string | null;
}

export interface EvaluationAnalysis {
  summary: string;
  match_score: number;
  feasibility: Feasibility;
  strengths: string[];
  weaknesses: string[];
  risk_items: RiskItem[];
  qualification_checklist: QualItem[];
  action_plan: string[];
  estimated_competition: CompetitionLevel;
}

// ── API response shapes ──────────────────────────────────────────────────

/** Single evaluation as returned by GET /evaluations/{id} or POST /analyze */
export interface BidEvaluation {
  id: string;
  proceso_id: string;
  match_score: number | null;
  feasibility: Feasibility | null;
  status: EvalStatus;
  analysis: EvaluationAnalysis | null;
  analysis_json?: string;
  created_at?: string;
  updated_at?: string;
  error?: string;
}

/** List response from GET /evaluations */
export interface EvaluationListResponse {
  evaluations: BidEvaluation[];
  total: number;
}
