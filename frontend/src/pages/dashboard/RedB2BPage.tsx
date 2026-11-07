/**
 * RedB2BPage — Sprint 8: B2B company network.
 *
 * Three sections on one page:
 *   1. Mi perfil B2B — opt-in visibility toggle + bio/website
 *   2. Directorio     — searchable company cards with connect flow
 *   3. Mis conexiones — pending (accept/reject) + accepted (contact info)
 *
 * Design choices:
 * - Browse directory: any logged-in user (drives PRO upsell via "Conectar" gate)
 * - Send connection: PRO only (gate enforced by API, surfaced in UI)
 * - Contact info: only visible after connection is ACCEPTED (privacy)
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Users, Building2, MapPin, Tag, Globe, Mail, Phone,
  UserPlus, Check, Clock, X, Loader2, Zap, Search,
  ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { DEPARTAMENTOS } from '@/lib/constants/departments';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

interface B2BProfile {
  is_public: boolean;
  bio?: string;
  website?: string;
}

interface CompanyCard {
  user_id: string;
  razon_social: string;
  nombre_comercial?: string;
  sector?: string;
  tamano?: string;
  departamento?: string;
  ciudad?: string;
  unspsc_codes: string[];
  capacidad_k?: number;
  bio?: string;
  website?: string;
  connection_id?: string;
  connection_status?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  is_requester?: boolean;
  email_contacto?: string;
  telefono?: string;
}

interface Connection {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  direction: 'OUTGOING' | 'INCOMING';
  message?: string;
  created_at: string;
  other_user_id: string;
  razon_social: string;
  nombre_comercial?: string;
  sector?: string;
  departamento?: string;
  email?: string;
  telefono?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const TAMANO_LABELS: Record<string, string> = {
  MICRO: 'Microempresa', PEQUENA: 'Pequeña', MEDIANA: 'Mediana', GRANDE: 'Grande',
};

function InitialAvatar({ name }: { name: string }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20
      border border-emerald-500/20 flex items-center justify-center shrink-0">
      <span className="text-emerald-400 font-bold text-sm">{initials}</span>
    </div>
  );
}

// ── Company card component ────────────────────────────────────────────────

function CompanyCardItem({
  company, isPro, onConnect, onConnectionUpdate,
}: {
  company: CompanyCard;
  isPro: boolean;
  onConnect: (targetId: string) => Promise<void>;
  onConnectionUpdate: (connectionId: string, accept: boolean) => Promise<void>;
}) {
  const [connecting, setConnecting] = useState(false);
  const [responding, setResponding] = useState(false);
  const [localStatus, setLocalStatus] = useState(company.connection_status);
  const [localIsRequester, setLocalIsRequester] = useState(company.is_requester);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await onConnect(company.user_id);
      setLocalStatus('PENDING');
      setLocalIsRequester(true);
    } finally {
      setConnecting(false);
    }
  };

  const handleRespond = async (accept: boolean) => {
    setResponding(true);
    try {
      await onConnectionUpdate(company.connection_id!, accept);
      setLocalStatus(accept ? 'ACCEPTED' : 'REJECTED');
    } finally {
      setResponding(false);
    }
  };

  const renderConnectionButton = () => {
    if (localStatus === 'ACCEPTED') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-400
          bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
          <Check className="w-3.5 h-3.5" /> Conectado
        </span>
      );
    }
    if (localStatus === 'REJECTED') {
      return (
        <span className="flex items-center gap-1.5 text-xs text-stone-500 px-3 py-1.5">
          Rechazado
        </span>
      );
    }
    if (localStatus === 'PENDING' && localIsRequester) {
      return (
        <span className="flex items-center gap-1.5 text-xs text-amber-400
          bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
          <Clock className="w-3.5 h-3.5" /> Pendiente
        </span>
      );
    }
    if (localStatus === 'PENDING' && !localIsRequester) {
      return (
        <div className="flex items-center gap-2">
          <button onClick={() => handleRespond(true)} disabled={responding}
            className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10
              border border-emerald-500/20 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/20
              transition-colors disabled:opacity-50">
            <Check className="w-3 h-3" /> Aceptar
          </button>
          <button onClick={() => handleRespond(false)} disabled={responding}
            className="flex items-center gap-1 text-xs text-stone-400 bg-white/5
              border border-white/10 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10
              hover:text-red-400 hover:border-red-500/20 transition-colors disabled:opacity-50">
            <X className="w-3 h-3" />
          </button>
        </div>
      );
    }
    // No connection yet
    if (!isPro) {
      return (
        <Link to="/checkout"
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-emerald-400
            border border-white/10 hover:border-emerald-500/20 px-3 py-1.5 rounded-lg
            bg-white/5 hover:bg-emerald-500/5 transition-colors">
          <Zap className="w-3 h-3" /> PRO
        </Link>
      );
    }
    return (
      <button onClick={handleConnect} disabled={connecting}
        className="flex items-center gap-1.5 text-xs text-stone-300 hover:text-white
          border border-white/10 hover:border-emerald-500/30 px-3 py-1.5 rounded-lg
          bg-white/5 hover:bg-emerald-500/5 transition-colors disabled:opacity-50">
        {connecting
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <UserPlus className="w-3.5 h-3.5" />}
        Conectar
      </button>
    );
  };

  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4
      hover:border-white/12 transition-colors">
      <div className="flex items-start gap-3 mb-3">
        <InitialAvatar name={company.razon_social} />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm leading-snug truncate">
            {company.nombre_comercial || company.razon_social}
          </h3>
          <p className="text-stone-500 text-xs truncate">{company.razon_social}</p>
        </div>
        {renderConnectionButton()}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500 mb-2.5">
        {company.sector && (
          <span className="flex items-center gap-1">
            <Tag className="w-3 h-3 shrink-0" />{company.sector}
          </span>
        )}
        {(company.ciudad || company.departamento) && (
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3 shrink-0" />
            {[company.ciudad, company.departamento].filter(Boolean).join(', ')}
          </span>
        )}
        {company.tamano && (
          <span className="text-stone-600">
            {TAMANO_LABELS[company.tamano] ?? company.tamano}
          </span>
        )}
      </div>

      {company.bio && (
        <p className="text-xs text-stone-400 line-clamp-2 mb-2.5">{company.bio}</p>
      )}

      {company.unspsc_codes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {company.unspsc_codes.slice(0, 4).map(code => (
            <span key={code}
              className="text-[10px] font-mono bg-white/5 text-stone-500
                border border-white/8 px-1.5 py-0.5 rounded">
              {code}
            </span>
          ))}
          {company.unspsc_codes.length > 4 && (
            <span className="text-[10px] text-stone-600">
              +{company.unspsc_codes.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Contact info — only when connected */}
      {localStatus === 'ACCEPTED' && (company.email_contacto || company.telefono) && (
        <div className="pt-2.5 border-t border-white/5 flex flex-wrap gap-3">
          {company.email_contacto && (
            <a href={`mailto:${company.email_contacto}`}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300">
              <Mail className="w-3 h-3" />{company.email_contacto}
            </a>
          )}
          {company.telefono && (
            <a href={`tel:${company.telefono}`}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-white">
              <Phone className="w-3 h-3" />{company.telefono}
            </a>
          )}
          {company.website && (
            <a href={company.website} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-white">
              <Globe className="w-3 h-3" />Sitio web
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ── Connection row ─────────────────────────────────────────────────────────

function ConnectionRow({
  conn, onRespond,
}: {
  conn: Connection;
  onRespond: (id: string, accept: boolean) => Promise<void>;
}) {
  const [responding, setResponding] = useState(false);
  const [localStatus, setLocalStatus] = useState(conn.status);

  const handle = async (accept: boolean) => {
    setResponding(true);
    try {
      await onRespond(conn.id, accept);
      setLocalStatus(accept ? 'ACCEPTED' : 'REJECTED');
    } finally {
      setResponding(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <InitialAvatar name={conn.razon_social} />
        <div className="min-w-0">
          <p className="text-sm text-white font-medium truncate">
            {conn.nombre_comercial || conn.razon_social}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-stone-500 mt-0.5">
            {conn.sector && <span>{conn.sector}</span>}
            {conn.departamento && <span>· {conn.departamento}</span>}
            <span className="text-stone-700">
              {conn.direction === 'INCOMING' ? '← recibida' : '→ enviada'}
            </span>
          </div>
          {localStatus === 'ACCEPTED' && (conn.email || conn.telefono) && (
            <div className="flex flex-wrap gap-3 mt-1.5">
              {conn.email && (
                <a href={`mailto:${conn.email}`}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300">
                  <Mail className="w-3 h-3" />{conn.email}
                </a>
              )}
              {conn.telefono && (
                <a href={`tel:${conn.telefono}`}
                  className="flex items-center gap-1 text-xs text-stone-400 hover:text-white">
                  <Phone className="w-3 h-3" />{conn.telefono}
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {localStatus === 'ACCEPTED' && (
          <span className="flex items-center gap-1 text-xs text-emerald-400
            bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
            <Check className="w-3 h-3" /> Conectado
          </span>
        )}
        {localStatus === 'REJECTED' && (
          <span className="text-xs text-stone-600 px-2.5 py-1">Rechazado</span>
        )}
        {localStatus === 'PENDING' && conn.direction === 'OUTGOING' && (
          <span className="flex items-center gap-1 text-xs text-amber-400
            bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
            <Clock className="w-3 h-3" /> Pendiente
          </span>
        )}
        {localStatus === 'PENDING' && conn.direction === 'INCOMING' && (
          <div className="flex items-center gap-2">
            <button onClick={() => handle(true)} disabled={responding}
              className="flex items-center gap-1 text-xs text-emerald-400
                bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg
                hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
              <Check className="w-3 h-3" /> Aceptar
            </button>
            <button onClick={() => handle(false)} disabled={responding}
              className="flex items-center gap-1 text-xs text-stone-500 hover:text-red-400
                border border-white/10 hover:border-red-500/20 px-2.5 py-1 rounded-lg
                bg-white/5 hover:bg-red-500/5 transition-colors disabled:opacity-50">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function RedB2BPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();

  const [myProfile, setMyProfile] = useState<B2BProfile>({ is_public: false });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved,  setProfileSaved]  = useState(false);

  const [q,           setQ]           = useState('');
  const [sector,      setSector]      = useState('');
  const [departamento,setDepartamento] = useState('');
  const [companies,   setCompanies]   = useState<CompanyCard[]>([]);
  const [dirTotal,    setDirTotal]    = useState(0);
  const [dirLoading,  setDirLoading]  = useState(true);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connsLoading,setConnsLoading]= useState(true);

  // ── Load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth?redirect=/dashboard/b2b'); return; }
    const token = getContractsToken();

    // My B2B profile
    fetch(`${API_BASE}/api/v1/b2b/my-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setMyProfile(d))
      .catch(() => {});

    // Connections
    fetch(`${API_BASE}/api/v1/b2b/connections`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setConnections(d.connections ?? []))
      .catch(() => {})
      .finally(() => setConnsLoading(false));
  }, [isAuthenticated, navigate]);

  // ── Directory search (debounced by form submit) ───────────────────

  const loadDirectory = useCallback(async () => {
    const token = getContractsToken();
    setDirLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', offset: '0' });
      if (q.trim())        params.set('q', q.trim());
      if (sector.trim())   params.set('sector', sector.trim());
      if (departamento)    params.set('departamento', departamento);

      const res = await fetch(`${API_BASE}/api/v1/b2b/directory?${params}`, {
        headers: { Authorization: `Bearer ${getContractsToken()}` },
      });
      if (!res.ok) return;
      const d = await res.json();
      setCompanies(d.companies ?? []);
      setDirTotal(d.total ?? 0);
    } finally {
      setDirLoading(false);
    }
  }, [q, sector, departamento]);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadDirectory();
  }, [isAuthenticated, loadDirectory]);

  // ── Save B2B profile ──────────────────────────────────────────────

  const saveProfile = async () => {
    const token = getContractsToken();
    setProfileSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/b2b/my-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(myProfile),
      });
      if (res.ok) {
        setMyProfile(await res.json());
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2500);
        loadDirectory(); // refresh in case my visibility changed
      }
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Connect ───────────────────────────────────────────────────────

  const handleConnect = async (targetId: string) => {
    const token = getContractsToken();
    const res = await fetch(`${API_BASE}/api/v1/b2b/connect/${targetId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.detail ?? `HTTP ${res.status}`);
    }
  };

  // ── Respond to connection ─────────────────────────────────────────

  const handleRespond = async (connectionId: string, accept: boolean) => {
    const token = getContractsToken();
    await fetch(`${API_BASE}/api/v1/b2b/connections/${connectionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accept }),
    });
  };

  const pendingIncoming = connections.filter(
    c => c.status === 'PENDING' && c.direction === 'INCOMING'
  );
  const accepted = connections.filter(c => c.status === 'ACCEPTED');
  const outgoing = connections.filter(
    c => c.status === 'PENDING' && c.direction === 'OUTGOING'
  );

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <Users className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Red B2B</h1>
          <p className="text-stone-500 text-sm">Conecta con empresas para postular juntos a licitaciones</p>
        </div>
      </div>

      {/* ── My B2B profile card ── */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" />
            Mi visibilidad en el directorio
          </h2>
          <button
            onClick={() => setMyProfile(p => ({ ...p, is_public: !p.is_public }))}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              myProfile.is_public ? 'bg-emerald-500' : 'bg-white/10'
            }`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              myProfile.is_public ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        <p className="text-xs text-stone-500 mb-4">
          {myProfile.is_public
            ? <><Eye className="w-3.5 h-3.5 inline mr-1 text-emerald-400" />Tu empresa aparece en el directorio público</>
            : <><EyeOff className="w-3.5 h-3.5 inline mr-1" />Tu empresa no aparece en el directorio</>}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-stone-500 mb-1.5">
              Descripción pública <span className="text-stone-700">(max 500 chars)</span>
            </label>
            <textarea
              value={myProfile.bio ?? ''}
              onChange={e => setMyProfile(p => ({ ...p, bio: e.target.value }))}
              maxLength={500}
              rows={3}
              placeholder="Describe brevemente tu empresa y en qué licitaciones tienes experiencia..."
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm
                text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40
                resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1.5">Sitio web</label>
            <input
              type="url" value={myProfile.website ?? ''}
              onChange={e => setMyProfile(p => ({ ...p, website: e.target.value }))}
              placeholder="https://miempresa.com"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm
                text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <Link to="/dashboard/perfil"
            className="text-xs text-stone-500 hover:text-stone-300 flex items-center gap-1">
            <ChevronRight className="w-3.5 h-3.5" />Actualizar datos de empresa
          </Link>
          <button onClick={saveProfile} disabled={profileSaving}
            className="flex items-center gap-1.5 text-xs bg-emerald-500 hover:bg-emerald-400
              text-white font-semibold px-4 py-2 rounded-lg transition-colors
              disabled:opacity-50">
            {profileSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
             : profileSaved ? <Check className="w-3.5 h-3.5" />
             : null}
            {profileSaving ? 'Guardando…' : profileSaved ? '¡Guardado!' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ── Directory ── */}
      <div className="mb-6">
        <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
          <Search className="w-4 h-4 text-emerald-500" />
          Directorio de empresas
          {dirTotal > 0 && (
            <span className="text-stone-600 font-normal text-xs">({dirTotal} visibles)</span>
          )}
        </h2>

        {/* Search filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text" value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadDirectory()}
            placeholder="Buscar empresa..."
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm
              text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
          />
          <input
            type="text" value={sector}
            onChange={e => setSector(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadDirectory()}
            placeholder="Sector..."
            className="w-full sm:w-40 bg-white/5 border border-white/10 rounded-xl px-3 py-2
              text-sm text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
          />
          <select
            value={departamento}
            onChange={e => { setDepartamento(e.target.value); }}
            className="w-full sm:w-44 bg-white/5 border border-white/10 rounded-xl px-3 py-2
              text-sm text-white focus:outline-none focus:border-emerald-500/40
              [&>option]:bg-[#0F1929]">
            <option value="">Todos los departamentos</option>
            {DEPARTAMENTOS.map(d => (
              <option key={d.code} value={d.name}>{d.name}</option>
            ))}
          </select>
          <button onClick={loadDirectory}
            className="shrink-0 px-4 py-2 bg-emerald-500/10 text-emerald-400 border
              border-emerald-500/20 rounded-xl text-sm hover:bg-emerald-500/15 transition-colors">
            Buscar
          </button>
        </div>

        {dirLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-10 h-10 text-stone-700 mx-auto mb-3" />
            <p className="text-stone-400 text-sm font-medium mb-1">
              {dirTotal === 0 ? 'Aún no hay empresas en el directorio'
               : 'Sin resultados para tu búsqueda'}
            </p>
            <p className="text-stone-600 text-xs">
              Activa tu visibilidad arriba para aparecer en el directorio.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {companies.map(c => (
              <CompanyCardItem
                key={c.user_id}
                company={c}
                isPro={isPro}
                onConnect={handleConnect}
                onConnectionUpdate={handleRespond}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Connections ── */}
      {!connsLoading && connections.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-emerald-500" />
            Mis conexiones
            <span className="text-stone-600 font-normal text-xs">
              ({accepted.length} conectadas · {pendingIncoming.length} pendientes)
            </span>
          </h2>

          {pendingIncoming.length > 0 && (
            <>
              <p className="text-xs text-amber-500 font-medium mb-2">
                Solicitudes recibidas ({pendingIncoming.length})
              </p>
              {pendingIncoming.map(c => (
                <ConnectionRow key={c.id} conn={c} onRespond={handleRespond} />
              ))}
              {(accepted.length > 0 || outgoing.length > 0) && (
                <div className="my-3 border-t border-white/5" />
              )}
            </>
          )}

          {accepted.map(c => (
            <ConnectionRow key={c.id} conn={c} onRespond={handleRespond} />
          ))}
          {outgoing.map(c => (
            <ConnectionRow key={c.id} conn={c} onRespond={handleRespond} />
          ))}
        </div>
      )}
    </div>
  );
}
