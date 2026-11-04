import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, X } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  size?: 'default' | 'large';
  autoFocus?: boolean;
}

export function SearchBar({
  initialQuery = '',
  onSearch,
  isLoading = false,
  placeholder = '¿Qué busca tu empresa? Ej: "Desarrollo de software Cali"',
  size = 'default',
  autoFocus = false,
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external initialQuery changes (e.g. when URL param updates)
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (onSearch) onSearch(q);
    else navigate(`/buscar?q=${encodeURIComponent(q)}`);
  };

  const handleClear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const isLarge = size === 'large';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="relative flex items-center">
        {/* Search icon */}
        <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500
          pointer-events-none shrink-0 ${isLarge ? 'w-5 h-5 left-4' : 'w-4 h-4'}`} />

        {/* Input */}
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full bg-white/5 border border-white/10 rounded-xl text-white
            placeholder-stone-600 focus:outline-none focus:border-emerald-500/50
            focus:bg-white/8 transition-all pr-20
            ${isLarge
              ? 'pl-12 py-4 text-base sm:text-lg'
              : 'pl-10 py-3 text-sm'
            }`}
        />

        {/* Clear button — shown when there's text */}
        {query && !isLoading && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-14 top-1/2 -translate-y-1/2 p-1
              text-stone-600 hover:text-stone-400 transition-colors"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className={`absolute right-2 top-1/2 -translate-y-1/2
            bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
            rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed
            transition-all flex items-center justify-center gap-1.5
            ${isLarge ? 'px-4 py-2.5 text-sm' : 'px-3 py-2 text-xs'}`}
          aria-label="Buscar"
        >
          {isLoading
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Search className="w-3.5 h-3.5" />
          }
          <span className="hidden sm:inline">{isLoading ? 'Buscando' : 'Buscar'}</span>
        </button>
      </div>
    </form>
  );
}
