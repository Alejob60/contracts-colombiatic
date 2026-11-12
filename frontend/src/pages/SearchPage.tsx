import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FilterPanel, type FilterValues } from '@/components/search/FilterPanel';
import { ResultCard } from '@/components/search/ResultCard';
import { ResultSkeleton } from '@/components/search/ResultSkeleton';
import { BlurOverlay } from '@/components/search/BlurOverlay';
import { useSecopSearch } from '@/hooks/useSecopSearch';
import { useSearchHistory } from '@/hooks/useSearchHistory';
import { FreshnessIndicator } from '@/components/search/FreshnessIndicator';
import {
  ChevronLeft, ChevronRight,
  X, Search, ListFilter, Clock, Trash2, Building2, Loader2,
} from 'lucide-react';
import { ProfileCompletionBanner } from '@/components/profile/ProfileCompletionBanner';
import { useProfileCompletion }    from '@/hooks/useProfileCompletion';
import { useAuthStore }            from '@/store/useAuthStore';

const EMPTY_FILTERS: FilterValues = {
  departamento: '',
  municipio: '',
  modalidad: '',
  tipo_contrato: '',
  precio_min: '',
  precio_max: '',
  estado_view: 'activos',
  year: '',
};

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [showGate, setShowGate] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const { data, loading, error, search } = useSecopSearch();
  const { history, push: pushHistory, remove: removeHistory, clear: clearHistory } = useSearchHistory();
  const { isAuthenticated } = useAuthStore();
  const { data: completion } = useProfileCompletion(isAuthenticated);

  // Dual-search state
  const [entityInput, setEntityInput] = useState(searchParams.get('entidad') ?? '');
  const [queryInput,  setQueryInput]  = useState(searchParams.get('q') ?? '');

  const currentQuery  = searchParams.get('q') ?? '';
  const currentEntidad = searchParams.get('entidad') ?? '';

  const runSearch = useCallback(
    (q: string, f: FilterValues, off: number, ent: string) => {
      if (!q.trim() && !ent.trim() && !Object.values(f).some(Boolean)) return;
      search(q, f, off, ent);
    },
    [search],
  );

  useEffect(() => {
    if (currentQuery || currentEntidad) runSearch(currentQuery, filters, offset, currentEntidad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuery, currentEntidad, offset]);

  useEffect(() => {
    if (data?.is_gated) setShowGate(true);
  }, [data]);

  // Close mobile drawer when body is scrolled (UX improvement)
  useEffect(() => {
    if (mobileFilters) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileFilters]);

  const handleSearch = () => {
    const q   = queryInput.trim();
    const ent = entityInput.trim();
    setOffset(0);
    const sp: Record<string, string> = {};
    if (q)   sp.q       = q;
    if (ent) sp.entidad = ent;
    setSearchParams(sp);
    runSearch(q, filters, 0, ent);
    if (q) pushHistory(q);
  };

  const handleEntityClear = () => {
    setEntityInput('');
    const sp: Record<string, string> = {};
    if (queryInput.trim()) sp.q = queryInput.trim();
    setSearchParams(sp);
    setOffset(0);
    runSearch(queryInput.trim(), filters, 0, '');
  };

  const handleFilters = (f: FilterValues) => {
    setFilters(f);
    setOffset(0);
    setMobileFilters(false);
    runSearch(currentQuery, f, 0, currentEntidad);
  };

  const LIMIT = 20;
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const currentPage = Math.floor(offset / LIMIT) + 1;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-brand-navy">

      {/* Gate overlay */}
      {showGate && (
        <BlurOverlay
          remainingSearches={data?.remaining_free_searches ?? 0}
          onDismiss={() => setShowGate(false)}
        />
      )}

      {/* ── Sticky search header — dual input ── */}
      <div className="sticky top-14 z-30 bg-brand-dark/95 backdrop-blur-xl border-b border-white/5 px-3 sm:px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Main dual-search row */}
          <form
            onSubmit={e => { e.preventDefault(); handleSearch(); }}
            className="flex flex-col sm:flex-row gap-2"
          >
            {/* Entity input */}
            <div className="relative sm:w-72 shrink-0">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input
                type="text"
                value={entityInput}
                onChange={e => setEntityInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Entidad — ej: Hospital Psiquiátrico"
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2.5
                  text-sm text-white placeholder-stone-600 focus:outline-none
                  focus:border-blue-500/50 focus:bg-white/8 transition-all"
              />
              {entityInput && (
                <button type="button" onClick={handleEntityClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Divider — hidden on mobile */}
            {entityInput && (
              <div className="hidden sm:flex items-center text-stone-700 text-xs font-medium shrink-0 select-none">
                dentro de →
              </div>
            )}

            {/* Keyword / object input */}
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input
                type="search"
                autoComplete="off"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={entityInput
                  ? '¿Qué necesitan? ej: plataforma digital, ingeniero, software'
                  : '¿Qué busca tu empresa? ej: desarrollo de software, obra civil'}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5
                  text-sm text-white placeholder-stone-600 focus:outline-none
                  focus:border-emerald-500/50 focus:bg-white/8 transition-all"
              />
            </div>

            {/* Search button */}
            <button
              type="submit"
              disabled={loading || (!queryInput.trim() && !entityInput.trim())}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5
                bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
                rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
                transition-all text-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span className="hidden sm:inline">{loading ? 'Buscando' : 'Buscar'}</span>
            </button>

            {/* Mobile filter toggle */}
            <button
              type="button"
              onClick={() => setMobileFilters(true)}
              className="lg:hidden relative shrink-0 flex items-center gap-1.5 px-3 py-2.5
                bg-white/5 border border-white/10 rounded-xl text-stone-300 hover:text-white
                hover:border-white/20 transition-all text-sm font-medium"
            >
              <ListFilter className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full
                  text-[10px] text-white font-bold flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </form>

          {/* Active context chips */}
          {(currentEntidad || (data && data.total > 0)) && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {currentEntidad && (
                <span className="flex items-center gap-1 text-xs bg-blue-500/10 border border-blue-500/20
                  text-blue-300 px-2.5 py-1 rounded-full">
                  <Building2 className="w-3 h-3" />
                  {currentEntidad}
                  <button onClick={handleEntityClear} className="text-blue-500 hover:text-blue-300 ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {currentQuery && currentEntidad && (
                <span className="text-xs text-stone-600">
                  filtrando por: <span className="text-stone-400">"{currentQuery}"</span>
                </span>
              )}
              {data && data.total > 0 && (
                <span className="text-xs text-stone-600 ml-auto">
                  {data.total.toLocaleString('es-CO')} procesos
                  {(data as any).profile_filters_active && (
                    <span className="ml-1.5 text-emerald-600">· filtros de tu perfil activos</span>
                  )}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Profile completion nudge — compact, only when logged in and score < 60 */}
      {completion && completion.score < 60 && (currentQuery || currentEntidad) && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-3">
          <ProfileCompletionBanner data={completion} variant="compact" />
        </div>
      )}

      {/* ── Mobile filter slide-over ── */}
      <AnimatePresence>
        {mobileFilters && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileFilters(false)}
            />
            {/* Drawer from right */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#0A0F1E]
                border-l border-white/8 flex flex-col lg:hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/8">
                <h2 className="text-white font-semibold">Filtros de búsqueda</h2>
                <button
                  onClick={() => setMobileFilters(false)}
                  className="p-2 rounded-xl text-stone-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <FilterPanel onApply={handleFilters} initialValues={filters} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Main layout ── */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:flex lg:gap-6">

        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-64 lg:shrink-0">
          <div className="sticky top-32">
            <FilterPanel onApply={handleFilters} initialValues={filters} />
          </div>
        </aside>

        {/* Results column */}
        <main className="flex-1 min-w-0">

          {/* Freshness indicator — shows govt update time + cache status */}
          {!loading && <div className="mb-3"><FreshnessIndicator /></div>}

          {/* Status bar */}
          {(data || loading) && (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="text-stone-500 text-sm">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    Buscando en SECOP II...
                  </span>
                ) : data ? (
                  <>
                    <span className="text-white font-semibold">
                      {data.total.toLocaleString('es-CO')}
                    </span>
                    {' '}procesos encontrados
                    {data.cached && (
                      <span className="ml-2 text-emerald-600 text-xs">· caché</span>
                    )}
                    {(data as any).cache_age_minutes !== undefined && (
                      <span className={`ml-2 text-[11px] ${
                        (data as any).cache_age_minutes < 30 ? 'text-emerald-500' :
                        (data as any).cache_age_minutes < 120 ? 'text-amber-500' :
                        'text-stone-600'
                      }`}>
                        · actualizado hace {(data as any).cache_age_minutes < 60
                          ? `${(data as any).cache_age_minutes}min`
                          : `${Math.round((data as any).cache_age_minutes / 60)}h`}
                      </span>
                    )}
                  </>
                ) : null}
              </p>
              {data && !data.is_gated && data.remaining_free_searches < 3 && (
                <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                  {data.remaining_free_searches === 0
                    ? '⚡ Activa Plan PRO'
                    : `${data.remaining_free_searches} búsqueda${data.remaining_free_searches !== 1 ? 's' : ''} restante${data.remaining_free_searches !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <ResultSkeleton key={i} />)}
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="text-center py-16 px-4">
              <p className="text-red-400 mb-3 text-sm">{error}</p>
              <button
                onClick={() => runSearch(currentQuery, filters, offset)}
                className="text-sm text-emerald-400 hover:text-emerald-300 underline"
              >
                Intentar de nuevo
              </button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && data && data.results.length === 0 && !data.is_gated && (
            <div className="py-12 px-4">
              <div className="text-center mb-6">
                <Search className="w-10 h-10 text-stone-700 mx-auto mb-3" />
                <p className="text-stone-400 font-medium mb-1">Sin resultados</p>
                <p className="text-stone-600 text-sm">Prueba con otros términos o amplía los filtros.</p>
              </div>

              {/* Sprint 10B: Banner for recent processes not yet in SODA */}
              {currentQuery && (
                <div className="max-w-lg mx-auto p-4 bg-amber-500/5 border border-amber-500/20
                  rounded-2xl">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-amber-500/10 rounded-xl flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-stone-300 font-medium text-sm mb-1">
                        ¿Es un proceso reciente de SECOP II?
                      </p>
                      <p className="text-stone-500 text-xs mb-3">
                        La API de datos.gov.co tiene 2-7 días de retraso. Los procesos publicados
                        esta semana pueden no aparecer aquí todavía. Si tienes el URL o el texto
                        del proceso, puedes agregarlo y usar toda la IA del sistema.
                      </p>
                      <Link
                        to="/dashboard/proceso-externo"
                        className="inline-flex items-center gap-1.5 text-xs text-amber-400
                          border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 rounded-lg
                          hover:bg-amber-500/15 transition-colors font-medium">
                        <FileText className="w-3.5 h-3.5" />
                        Agregar proceso manualmente →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Initial prompt + Search history */}
          {!loading && !error && !data && !currentQuery && (
            <div className="py-10 px-4">
              <div className="text-center mb-8">
                <Search className="w-12 h-12 text-stone-700 mx-auto mb-4" />
                <p className="text-stone-400 font-semibold mb-2">Busca licitaciones SECOP II</p>
                <p className="text-stone-600 text-sm max-w-xs mx-auto leading-relaxed">
                  Escribe tu actividad, entidad o tipo de contrato. Filtra por departamento.
                </p>
                <p className="text-stone-700 text-xs mt-2">
                  Tip: usa el código del proceso si tienes el número de SECOP II (ej: <span className="font-mono">CO1.REQ.9858108</span>)
                </p>
              </div>

              {/* Search history */}
              {history.length > 0 && (
                <div className="max-w-lg mx-auto">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-stone-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Búsquedas recientes
                    </p>
                    <button onClick={clearHistory}
                      className="text-[10px] text-stone-700 hover:text-stone-500 flex items-center gap-1">
                      <Trash2 className="w-3 h-3" /> Limpiar
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {history.map(h => (
                      <div key={h.query} className="flex items-center gap-0 bg-white/5 border border-white/8
                        rounded-lg overflow-hidden">
                        <button
                          onClick={() => { setQueryInput(h.query); handleSearch(); }}
                          className="px-3 py-1.5 text-xs text-stone-400 hover:text-white hover:bg-white/5
                            transition-colors flex items-center gap-1.5">
                          <Search className="w-3 h-3" />
                          {h.query}
                        </button>
                        <button
                          onClick={() => removeHistory(h.query)}
                          className="px-2 py-1.5 text-stone-700 hover:text-stone-400
                            border-l border-white/8 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Results list */}
          {!loading && data && data.results.length > 0 && (
            <>
              <motion.div
                className="space-y-2 sm:space-y-3"
                initial="hidden"
                animate="visible"
                variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.03 } } }}
              >
                {data.results.map((proc, idx) => (
                  <motion.div
                    key={proc.proceso_id || idx}
                    variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  >
                    <ResultCard
                      process={proc}
                      isBlurred={!proc.url_proceso && !proc.descripcion && !proc.precio_base}
                      onUpgrade={() => setShowGate(true)}
                    />
                  </motion.div>
                ))}
              </motion.div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-8 pb-4">
                  <button
                    onClick={() => { setOffset(Math.max(0, offset - LIMIT)); window.scrollTo(0, 0); }}
                    disabled={offset === 0}
                    className="flex items-center gap-1.5 px-4 py-2 border border-white/10 rounded-xl
                      text-stone-400 hover:text-white hover:border-white/20 disabled:opacity-30
                      disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </button>
                  <span className="text-stone-500 text-sm tabular-nums">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => { setOffset(offset + LIMIT); window.scrollTo(0, 0); }}
                    disabled={currentPage >= totalPages}
                    className="flex items-center gap-1.5 px-4 py-2 border border-white/10 rounded-xl
                      text-stone-400 hover:text-white hover:border-white/20 disabled:opacity-30
                      disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    Siguiente <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
