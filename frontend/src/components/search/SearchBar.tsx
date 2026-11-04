import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';

interface SearchBarProps {
  initialQuery?: string;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  size?: 'default' | 'large';
}

export function SearchBar({
  initialQuery = '',
  onSearch,
  isLoading = false,
  placeholder = '¿Qué busca tu empresa? Ej: "Desarrollo de software en Valle del Cauca"',
  autoFocus = false,
  size = 'default',
}: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    if (onSearch) {
      onSearch(query.trim());
    } else {
      navigate(`/buscar?q=${encodeURIComponent(query.trim())}`);
    }
  };

  const isLarge = size === 'large';

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className={`relative flex items-center gap-2 ${isLarge ? 'gap-3' : ''}`}>
        <div className="relative flex-1">
          <Search
            className={`absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none ${
              isLarge ? 'w-5 h-5' : 'w-4 h-4'
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`w-full bg-white/5 border border-white/10 rounded-xl text-white placeholder-stone-500
              focus:outline-none focus:border-emerald-500/50 focus:bg-white/8 transition-all
              ${isLarge ? 'pl-12 pr-4 py-4 text-base' : 'pl-10 pr-4 py-3 text-sm'}`}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className={`shrink-0 bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
            rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
            transition-all flex items-center gap-2
            ${isLarge ? 'px-6 py-4 text-base' : 'px-4 py-3 text-sm'}`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </div>
    </form>
  );
}
