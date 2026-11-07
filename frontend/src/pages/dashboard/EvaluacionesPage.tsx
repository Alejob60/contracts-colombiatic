/**
 * EvaluacionesPage — Sprint 5: AI Bid Evaluator.
 *
 * WHY a single page with list + detail instead of separate routes:
 * evaluations are a focused PRO feature — the user flow is linear
 * (list → click → detail panel). A modal/expandable detail avoids
 * full-page navigation and keeps the list context visible.
 *
 * The match score gauge uses a pure SVG arc — no charting library needed
 * for a single metric display.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bot, Loader2, AlertCircle, ArrowLeft, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, HelpCircle, Shield,
  TrendingUp, TrendingDown, Target, ClipboardList,
} from 'lucide-react';
import { getContractsToken, useAuthStore } from '@/store/useAuthStore';
import {
  fetchEvaluations,
  analyzeProcess,
} from '@/lib/api/evaluation';
import type {
  BidEvaluation,
  Feasibility,
  RiskSeverity,
} from '@/types/evaluation';

// ── Constants ─────────────────────────────────────────────────────────────

/** Polling interval while an evaluation is ANALYZING (3 seconds) */
const POLL_INTERVAL_MS = 3_000;

/** Score thresholds for color coding (0-100 scale) */
const SCORE_THRESHOLD_LOW = 40;
const SCORE_THRESHOLD_MID = 70;

/** SVG arc gauge geometry */
const GAUGE_RADIUS = 54;
const GAUGE_STROKE = 8;
const GAUGE_CIRCUMFERENCE = Math.PI * GAUGE_RADIUS;

// ── Feasibility display config ────────────────────────────────────────────

const FEASIBILITY_CONFIG: Record<Feasibility, { label: string; icon: typeof CheckCircle; cls: string }> = {
  VIABLE:              { label: '✓ Viable',              icon: CheckCircle,   cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  PARCIAL:             { label: '⚠ Con observaciones',   icon: AlertTriangle, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  NO_VIABLE:           { label: '✗ No viable',           icon: XCircle,       cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  DATOS_INSUFICIENTES: { label: 'Sin datos suficientes', icon: HelpCircle,    cls: 'bg-stone-500/10 text-stone-400 border-stone-500/20' },
};

const SEVERITY_CONFIG: Record<RiskSeverity, string> = {
  ALTA:  'bg-red-500/10 text-red-400 border-red-500/20',
  MEDIA: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  BAJA:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

// ── Score color helper ────────────────────────────────────────────────────

function scoreColorClass(score: number): string {
  if (score <= SCORE_THRESHOLD_LOW) return 'text-red-400';
  if (score <= SCORE_THRESHOLD_MID) return 'text-amber-400';
  return 'text-emerald-400';
}

function scoreStrokeColor(score: number): string {
  if (score <= SCORE_THRESHOLD_LOW) return '#f87171';
  if (score <= SCORE_THRESHOLD_MID) return '#fbbf24';
  return '#34d399';
}

function scoreTrackColor(score: number): string {
  if (score <= SCORE_THRESHOLD_LOW) return 'rgba(248,113,113,0.15)';
  if (score <= SCORE_THRESHOLD_MID) return 'rgba(251,191,36,0.15)';
  return 'rgba(52,211,153,0.15)';
}

// ── Date formatter ────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

// ── Score Gauge (SVG semi-circle arc) ─────────────────────────────────────

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const fraction = Math.max(0, Math.min(score, 100)) / 100;
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - fraction);
  const dimension = size === 'sm' ? 80 : 128;
  const viewBox = `0 0 ${GAUGE_RADIUS * 2 + GAUGE_STROKE} ${GAUGE_RADIUS + GAUGE_STROKE + 8}`;

  return (
    <div className="flex flex-col items-center">
      <svg
        width={dimension}
        height={dimension * 0.55}
        viewBox={viewBox}
        className="overflow-visible"
      >
        {/* Track arc (background) */}
        <path
          d={`M ${GAUGE_STROKE / 2},${GAUGE_RADIUS + GAUGE_STROKE / 2}
              a ${GAUGE_RADIUS},${GAUGE_RADIUS} 0 0,1 ${GAUGE_RADIUS * 2},0`}
          fill="none"
          stroke={scoreTrackColor(score)}
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
        />
        {/* Value arc */}
        <path
          d={`M ${GAUGE_STROKE / 2},${GAUGE_RADIUS + GAUGE_STROKE / 2}
              a ${GAUGE_RADIUS},${GAUGE_RADIUS} 0 0,1 ${GAUGE_RADIUS * 2},0`}
          fill="none"
          stroke={scoreStrokeColor(score)}
          strokeWidth={GAUGE_STROKE}
          strokeLinecap="round"
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className={`font-bold ${size === 'sm' ? 'text-lg -mt-3' : 'text-3xl -mt-5'} ${scoreColorClass(score)}`}>
        {Math.round(score)}%
      </span>
    </div>
  );
}

// ── Feasibility Badge ─────────────────────────────────────────────────────

function FeasibilityBadge({ value }: { value: Feasibility }) {
  const config = FEASIBILITY_CONFIG[value];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${config.cls}`}>
      <config.icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

// ── Evaluation Card (list item) ───────────────────────────────────────────

function EvaluationCard({
  evaluation,
  onSelect,
}: {
  evaluation: BidEvaluation;
  onSelect: (evaluation: BidEvaluation) => void;
}) {
  const isCompleted = evaluation.status === 'COMPLETED';
  const isFailed = evaluation.status === 'FAILED';
  const isAnalyzing = evaluation.status === 'ANALYZING';
  const matchScore = evaluation.analysis?.match_score ?? (evaluation.match_score != null ? evaluation.match_score * 100 : null);

  return (
    <div
      className={`bg-white/[0.02] border border-white/8 rounded-xl p-4 transition-all ${
        isCompleted ? 'hover:border-emerald-500/20 hover:bg-white/[0.04] cursor-pointer' : ''
      }`}
      onClick={() => isCompleted && onSelect(evaluation)}
      role={isCompleted ? 'button' : undefined}
      tabIndex={isCompleted ? 0 : undefined}
      onKeyDown={(e) => {
        if (isCompleted && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(evaluation);
        }
      }}
    >
      <div className="flex items-start gap-4">
        {/* Score gauge or status indicator */}
        <div className="shrink-0 flex items-center justify-center w-20">
          {isCompleted && matchScore != null ? (
            <ScoreGauge score={matchScore} size="sm" />
          ) : isAnalyzing ? (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              <span className="text-[10px] text-stone-500">Analizando</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <AlertCircle className="w-8 h-8 text-red-400" />
              <span className="text-[10px] text-red-400">Error</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1 font-mono truncate">
            {evaluation.proceso_id}
          </p>
          {isCompleted && evaluation.analysis && (
            <p className="text-white text-sm leading-snug line-clamp-2 mb-2">
              {evaluation.analysis.summary}
            </p>
          )}
          {isFailed && (
            <p className="text-red-400 text-sm mb-2">
              {evaluation.error ?? 'Error en el análisis'}
            </p>
          )}
          {isAnalyzing && (
            <p className="text-stone-400 text-sm mb-2 animate-pulse">
              Analizando pliego con IA...
            </p>
          )}

          {/* Bottom row: feasibility + date */}
          <div className="flex items-center gap-3 flex-wrap">
            {isCompleted && evaluation.feasibility && (
              <FeasibilityBadge value={evaluation.feasibility as Feasibility} />
            )}
            {evaluation.created_at && (
              <span className="text-xs text-stone-600">
                {formatDate(evaluation.created_at)}
              </span>
            )}
          </div>
        </div>

        {/* Chevron for completed */}
        {isCompleted && (
          <ChevronRight className="w-5 h-5 text-stone-600 shrink-0 self-center" />
        )}
      </div>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────

function AnalysisDetail({
  evaluation,
  onBack,
}: {
  evaluation: BidEvaluation;
  onBack: () => void;
}) {
  const analysis = evaluation.analysis;
  if (!analysis) return null;

  const matchScore = analysis.match_score;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-white
          transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a evaluaciones
      </button>

      {/* Header */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-6">
        <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-2 font-mono">
          {evaluation.proceso_id}
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-6 mb-4">
          <ScoreGauge score={matchScore} />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-white font-bold text-lg mb-2">Resultado del análisis</h2>
            <FeasibilityBadge value={analysis.feasibility} />
            <p className="text-stone-400 text-sm mt-3 leading-relaxed">
              {analysis.summary}
            </p>
          </div>
        </div>

        {/* Competition estimate */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
          <Target className="w-4 h-4 text-stone-500" />
          <span className="text-xs text-stone-500">Competencia estimada:</span>
          <span className={`text-xs font-semibold ${
            analysis.estimated_competition === 'BAJA' ? 'text-emerald-400' :
            analysis.estimated_competition === 'MEDIA' ? 'text-amber-400' : 'text-red-400'
          }`}>
            {analysis.estimated_competition}
          </span>
        </div>
      </div>

      {/* Strengths / Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-white font-semibold text-sm">Fortalezas</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.strengths.map((strength, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10
                  text-emerald-400 border border-emerald-500/15"
              >
                {strength}
              </span>
            ))}
            {analysis.strengths.length === 0 && (
              <span className="text-xs text-stone-600 italic">Ninguna identificada</span>
            )}
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-red-400" />
            <h3 className="text-white font-semibold text-sm">Debilidades</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.weaknesses.map((weakness, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-full bg-red-500/10
                  text-red-400 border border-red-500/15"
              >
                {weakness}
              </span>
            ))}
            {analysis.weaknesses.length === 0 && (
              <span className="text-xs text-stone-600 italic">Ninguna identificada</span>
            )}
          </div>
        </div>
      </div>

      {/* Qualification checklist */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-semibold text-sm">Checklist de habilitación</h3>
        </div>
        {analysis.qualification_checklist.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 uppercase tracking-wider border-b border-white/5">
                  <th className="text-left py-2 pr-3 font-medium">Requisito</th>
                  <th className="text-center py-2 px-2 font-medium w-12">Estado</th>
                  <th className="text-left py-2 px-3 font-medium">Evidencia</th>
                  <th className="text-left py-2 pl-3 font-medium">Brecha</th>
                </tr>
              </thead>
              <tbody>
                {analysis.qualification_checklist.map((item, idx) => (
                  <tr key={idx} className="border-b border-white/[0.03]">
                    <td className="py-2.5 pr-3 text-stone-300">{item.requirement}</td>
                    <td className="py-2.5 px-2 text-center">
                      {item.met ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-stone-500">
                      {item.evidence ?? '—'}
                    </td>
                    <td className="py-2.5 pl-3 text-stone-500">
                      {item.gap ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-stone-600 text-xs italic">Sin requisitos identificados</p>
        )}
      </div>

      {/* Risk matrix */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-amber-400" />
          <h3 className="text-white font-semibold text-sm">Matriz de riesgos</h3>
        </div>
        {analysis.risk_items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 uppercase tracking-wider border-b border-white/5">
                  <th className="text-left py-2 pr-3 font-medium">Categoría</th>
                  <th className="text-center py-2 px-2 font-medium">Severidad</th>
                  <th className="text-left py-2 px-3 font-medium">Descripción</th>
                  <th className="text-left py-2 pl-3 font-medium">Recomendación</th>
                </tr>
              </thead>
              <tbody>
                {analysis.risk_items.map((risk, idx) => (
                  <tr key={idx} className="border-b border-white/[0.03]">
                    <td className="py-2.5 pr-3 text-stone-300 font-medium whitespace-nowrap">
                      {risk.category}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5
                        rounded-full border ${SEVERITY_CONFIG[risk.severity]}`}>
                        {risk.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-stone-400">
                      {risk.description}
                    </td>
                    <td className="py-2.5 pl-3 text-stone-500">
                      {risk.recommendation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-stone-600 text-xs italic">Sin riesgos identificados</p>
        )}
      </div>

      {/* Action plan */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-emerald-400" />
          <h3 className="text-white font-semibold text-sm">Plan de acción</h3>
        </div>
        {analysis.action_plan.length > 0 ? (
          <ol className="space-y-2">
            {analysis.action_plan.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/10
                  text-emerald-400 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <span className="text-sm text-stone-300 pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-stone-600 text-xs italic">Sin pasos definidos</p>
        )}
      </div>

      {/* Back to list */}
      <div className="pt-4 border-t border-white/5">
        <button
          onClick={onBack}
          className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
        >
          ← Volver a evaluaciones
        </button>
      </div>
    </div>
  );
}

// ── Trigger evaluation form ───────────────────────────────────────────────

function TriggerForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (procesoId: string) => void;
  isSubmitting: boolean;
}) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-6">
      <h2 className="text-white font-semibold text-sm mb-3">Evaluar un proceso</h2>
      <p className="text-stone-500 text-xs mb-4">
        Ingresa el ID del proceso SECOP II (ej: CO1.REQ.4912345) para analizar si tu empresa puede ganar la licitación.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="CO1.REQ...."
          disabled={isSubmitting}
          className="flex-1 bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white
            placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors
            disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || isSubmitting}
          className="shrink-0 flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
            text-white font-semibold px-4 py-2.5 rounded-xl hover:opacity-90
            disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Bot className="w-4 h-4" />
          )}
          {isSubmitting ? 'Analizando...' : 'Evaluar'}
        </button>
      </div>
    </form>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function EvaluacionesPage() {
  const navigate = useNavigate();
  const { isPro } = useAuthStore();
  const [evaluations, setEvaluations] = useState<BidEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [selectedEval, setSelectedEval] = useState<BidEvaluation | null>(null);

  // Redirect non-PRO users
  useEffect(() => {
    if (!isPro) {
      navigate('/pricing', { replace: true });
    }
  }, [isPro, navigate]);

  // ── Fetch evaluations ───────────────────────────────────────────────

  const loadEvaluations = useCallback(async () => {
    const token = getContractsToken();
    if (!token) return;
    try {
      const response = await fetchEvaluations(token);
      setEvaluations(response.evaluations);
      setError('');
    } catch (fetchErr) {
      const message = fetchErr instanceof Error ? fetchErr.message : 'Error cargando evaluaciones';
      setError(message);
      console.error('[EvaluacionesPage] load failed:', { message });
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  // Poll while any evaluation is ANALYZING
  useEffect(() => {
    const hasAnalyzing = evaluations.some(ev => ev.status === 'ANALYZING');
    if (!hasAnalyzing) return;
    const intervalId = setInterval(() => void loadEvaluations(), POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [evaluations, loadEvaluations]);

  // ── Trigger new evaluation ──────────────────────────────────────────

  const handleTrigger = async (procesoId: string) => {
    const token = getContractsToken();
    if (!token) {
      navigate('/auth?redirect=/dashboard/evaluaciones');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      const result = await analyzeProcess(token, procesoId);
      // Add to list or update existing
      setEvaluations(prev => {
        const existingIdx = prev.findIndex(ev => ev.id === result.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = result;
          return updated;
        }
        return [result, ...prev];
      });
      // If completed, auto-select it
      if (result.status === 'COMPLETED') {
        setSelectedEval(result);
      }
    } catch (triggerErr) {
      const message = triggerErr instanceof Error ? triggerErr.message : 'Error al evaluar';
      setSubmitError(message);
      console.error('[EvaluacionesPage] trigger failed:', { message, procesoId });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isPro) return null;

  // ── Render: detail view ─────────────────────────────────────────────

  if (selectedEval) {
    return (
      <div className="max-w-3xl">
        <AnalysisDetail
          evaluation={selectedEval}
          onBack={() => setSelectedEval(null)}
        />
      </div>
    );
  }

  // ── Render: list view ───────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-xl">Evaluaciones IA</h1>
            {evaluations.length > 0 && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full
                bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {evaluations.length}
              </span>
            )}
          </div>
          <p className="text-stone-500 text-sm">
            Análisis de factibilidad de licitaciones con IA
          </p>
        </div>
      </div>

      {/* Trigger form */}
      <TriggerForm onSubmit={handleTrigger} isSubmitting={submitting} />

      {/* Submit error */}
      {submitError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl
          text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {submitError}
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Evaluations list */}
      <h2 className="text-stone-500 text-xs uppercase tracking-wider font-medium mb-4">
        Tus evaluaciones
      </h2>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : evaluations.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="w-10 h-10 text-stone-700 mx-auto mb-4" />
          <p className="text-stone-400 font-medium mb-2">Sin evaluaciones</p>
          <p className="text-stone-600 text-sm max-w-sm mx-auto">
            Evalúa una licitación para ver si tu empresa puede ganarla. Ingresa el ID del proceso arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {evaluations.map(ev => (
            <EvaluationCard
              key={ev.id}
              evaluation={ev}
              onSelect={setSelectedEval}
            />
          ))}
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 pt-4 border-t border-white/5">
        <Link
          to="/dashboard"
          className="text-stone-500 hover:text-stone-300 text-sm transition-colors"
        >
          ← Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
