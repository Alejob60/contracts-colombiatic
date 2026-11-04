import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterPanel, type FilterValues } from '@/components/search/FilterPanel';
import { ResultCard } from '@/components/search/ResultCard';
import { ResultSkeleton } from '@/components/search/ResultSkeleton';
import { BlurOverlay } from '@/components/search/BlurOverlay';
import { useSecopSearch } from '@/hooks/useSecopSearch';
import { ChevronLeft, ChevronRight, SlidersHorizontal, X, Search } from 'lucide-react';

const EMPTY_FILTERS: FilterValues = {
  departamento: '',
  modalidad: '',
  tipo_contrato: '',
  precio_min: '',
  precio_max: '',
};

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [showGate, setShowGate] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);
  const { data, loading, error, search } = useSecopSearch();

  const currentQuery = searchParams.get('q') ?? '';

  // Run search whenever query / filters / offset changes
  const runSearch = useCallback(
    (q: string, f: FilterValues, off: number) => {
      if (!q.trim() && !Object.values(f).some(Boolean)) return;
      search(q, f, off);
    },
    [search],
  );

  useEffect(() => {
    if (currentQuery) {
      runSearch(currentQuery, filters, offset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuery, offset]);

  // Show gate when API returns 402 (is_gated)
  useEffect(() => {
    if (data?.is_gated) setShowGate(true);
  }, [data]);

  const handleSearch = (q: string) => {
    setOffset(0);
    setSearchParams(q ? { q } : {});
    runSearch(q, filters, 0);
  };

  const handleFilters = (f: FilterValues) => {
    setFilters(f);
    setOffset(0);
    runSearch(currentQuery, f, 0);
    setMobileFilters(false);
  };

  const LIMIT = 20;
  const totalPages = data ? Math.ceil(data.total / LIMIT) : 0;
  const currentPage = Math.floor(offset / LIMIT) + 1;

  return (
    <div className="min-h-screen bg-brand-navy pt-20">
      {showGate && (
        <BlurOverlay
          remainingSearches={data?.remaining_free_searches ?? 0}
          onDismiss={() => setShowGate(false)}
        />
      )}

      {/* Search header */}
      <div className="bg-brand-dark/60 border-b border-white/5 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="flex-1">
            <SearchBar
              initialQuery={currentQuery}
              onSearch={handleSearch}
              isLoading={loading}
              size="default"
            />
          </div>
          <button
            onClick={() => setMobileFilters(true)}
            className="md:hidden shrink-0 p-3 bg-white/5 border border-white/8 rounded-xl
              text-stone-400 hover:text-white transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar — desktop */}
        <aside className="hidden md:block w-64 shrink-0">
          <FilterPanel onApply={handleFilters} initialValues={filters} />
        </aside>

        {/* Mobile filter drawer */}
        {mobileFilters && (
          <div className="fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFilters(false)} />
            <div className="relative ml-auto w-80 bg-brand-dark h-full overflow-y-auto p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Filtros</h2>
                <button onClick={() => setMobileFilters(false)}>
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
              <FilterPanel onApply={handleFilters} initialValues={filters} />
            </div>
          </div>
        )}

        {/* Results area */}
        <main className="flex-1 min-w-0">
          {/* Status bar */}
          {(data || loading) && (
            <div className="flex items-center justify-between mb-4">
              <p className="text-stone-500 text-sm">
                {loading ? (
                  'Buscando...'
                ) : data ? (
                  <>
                    <span className="text-white font-medium">{data.total.toLocaleString('es-CO')}</span>
                    {' '}procesos encontrados
                    {data.cached && (
                      <span className="ml-2 text-emerald-600 text-xs">(desde caché)</span>
                    )}
                  </>
                ) : null}
              </p>
              {data && !data.is_gated && data.remaining_free_searches < 3 && (
                <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-1 rounded-full">
                  {data.remaining_free_searches === 0
                    ? 'Búsquedas gratuitas agotadas — activa Plan PRO'
                    : `${data.remaining_free_searches} búsqueda${data.remaining_free_searches !== 1 ? 's' : ''} gratuita${data.remaining_free_searches !== 1 ? 's' : ''} restante${data.remaining_free_searches !== 1 ? 's' : ''}`}
                </span>
              )}
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ResultSkeleton key={i} />
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-center py-16">
              <p className="text-red-400 mb-2">{error}</p>
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
            <div className="text-center py-16">
              <Search className="w-10 h-10 text-stone-600 mx-auto mb-3" />
              <p className="text-stone-400 font-medium mb-1">Sin resultados</p>
              <p className="text-stone-600 text-sm">
                Prueba con otros términos o amplía los filtros.
              </p>
            </div>
          )}

          {/* Initial empty state */}
          {!loading && !error && !data && !currentQuery && (
            <div className="text-center py-20">
              <Search className="w-12 h-12 text-stone-700 mx-auto mb-4" />
              <p className="text-stone-500 text-lg font-medium mb-2">
                Busca licitaciones de SECOP II
              </p>
              <p className="text-stone-600 text-sm max-w-sm mx-auto">
                Escribe lo que tu empresa busca — actividad económica, tipo de contrato, entidad o departamento.
              </p>
            </div>
          )}

          {/* Results grid */}
          {!loading && data && data.results.length > 0 && (
            <>
              <motion.div
                className="space-y-3"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.04 } },
                }}
              >
                {data.results.map((proc, idx) => (
                  <motion.div
                    key={proc.proceso_id || idx}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0 },
                    }}
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
                <div className="flex items-center justify-center gap-3 mt-8">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0}
                    className="p-2 border border-white/8 rounded-lg text-stone-400 hover:text-white
                      disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-stone-400 text-sm">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setOffset(offset + LIMIT)}
                    disabled={currentPage >= totalPages}
                    className="p-2 border border-white/8 rounded-lg text-stone-400 hover:text-white
                      disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
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
