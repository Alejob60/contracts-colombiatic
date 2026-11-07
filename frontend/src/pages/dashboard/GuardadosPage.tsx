import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import {
  Bookmark, Bell, BellOff, Trash2, Loader2, Search,
  MapPin, Building2, DollarSign,
} from 'lucide-react';
import { formatCOP } from '@/lib/utils/formatCurrency';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface SavedProcess {
  id: string; proceso_id: string; nombre_proceso?: string;
  entidad?: string; precio_base?: number; departamento?: string;
  ciudad?: string; estado?: string; notes?: string;
  alert_enabled: boolean; created_at: string;
}

function SavedCard({
  item, onRemove, onToggleAlert,
}: {
  item: SavedProcess;
  onRemove: (id: string) => void;
  onToggleAlert: (id: string, enabled: boolean) => void;
}) {
  const [removing,  setRemoving]  = useState(false);
  const [toggling,  setToggling]  = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleRemove = async () => {
    if (!confirmed) { setConfirmed(true); setTimeout(() => setConfirmed(false), 3000); return; }
    setRemoving(true);
    onRemove(item.proceso_id);
  };

  const handleAlert = async () => {
    setToggling(true);
    try { onToggleAlert(item.proceso_id, !item.alert_enabled); }
    finally { setToggling(false); }
  };

  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-xl p-4 hover:border-white/12 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium text-sm leading-snug line-clamp-2 mb-1">
            {item.nombre_proceso || item.proceso_id}
          </h3>
          {item.entidad && (
            <div className="flex items-center gap-1 text-xs text-stone-500">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{item.entidad}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-stone-500 mb-3">
        {(item.ciudad || item.departamento) && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {[item.ciudad, item.departamento].filter(Boolean).join(', ')}
          </span>
        )}
        {item.precio_base && (
          <span className="flex items-center gap-1 text-emerald-500">
            <DollarSign className="w-3 h-3" />
            {formatCOP(item.precio_base)}
          </span>
        )}
        {item.estado && (
          <span className="px-1.5 py-0.5 bg-white/5 rounded text-stone-400">{item.estado}</span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-white/5">
        <button onClick={handleAlert} disabled={toggling}
          className={`flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-lg ${
            item.alert_enabled
              ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
              : 'text-stone-500 hover:text-stone-300 hover:bg-white/5'
          }`}>
          {item.alert_enabled
            ? <Bell className="w-3.5 h-3.5" />
            : <BellOff className="w-3.5 h-3.5" />}
          {item.alert_enabled ? 'Alerta activa' : 'Sin alerta'}
        </button>

        <button onClick={handleRemove} disabled={removing}
          className={`flex items-center gap-1.5 text-xs transition-colors px-2 py-1 rounded-lg ${
            confirmed
              ? 'text-red-400 bg-red-500/10'
              : 'text-stone-600 hover:text-red-400 hover:bg-red-500/5'
          }`}>
          <Trash2 className="w-3.5 h-3.5" />
          {confirmed ? '¿Eliminar?' : 'Quitar'}
        </button>
      </div>
    </div>
  );
}

export function GuardadosPage() {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<SavedProcess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth?redirect=/dashboard/guardados'); return; }
    const token = getContractsToken();
    fetch(`${API_BASE}/api/v1/company/saved`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setProcesses(d.saved ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const handleRemove = useCallback(async (procesoId: string) => {
    const token = getContractsToken();
    await fetch(`${API_BASE}/api/v1/company/saved/${procesoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    setProcesses(prev => prev.filter(p => p.proceso_id !== procesoId));
  }, []);

  const handleToggleAlert = useCallback(async (procesoId: string, enabled: boolean) => {
    const token = getContractsToken();
    const res = await fetch(`${API_BASE}/api/v1/company/saved/${procesoId}/alert`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      const updated = await res.json();
      setProcesses(prev => prev.map(p => p.proceso_id === procesoId ? { ...p, alert_enabled: updated.alert_enabled } : p));
    }
  }, []);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Bookmark className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              Procesos Guardados
              {processes.length > 0 && (
                <span className="text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20
                  px-2 py-0.5 rounded-full font-normal">
                  {processes.length}
                </span>
              )}
            </h1>
            <p className="text-stone-500 text-sm">Licitaciones que estás siguiendo</p>
          </div>
        </div>
        <Link to="/buscar"
          className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-white transition-colors">
          <Search className="w-4 h-4" /> Buscar más
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      ) : processes.length === 0 ? (
        <div className="text-center py-16">
          <Bookmark className="w-10 h-10 text-stone-700 mx-auto mb-4" />
          <p className="text-stone-400 font-medium mb-2">No tienes procesos guardados</p>
          <p className="text-stone-600 text-sm mb-5">
            Busca licitaciones y guárdalas aquí para hacer seguimiento.
          </p>
          <Link to="/buscar"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:opacity-90">
            Buscar licitaciones
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {processes.map(p => (
            <SavedCard key={p.id} item={p} onRemove={handleRemove} onToggleAlert={handleToggleAlert} />
          ))}
        </div>
      )}
    </div>
  );
}
