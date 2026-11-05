import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Mail, Lock, User, Building2, FileSearch } from 'lucide-react';
import { useAuthStore, apiLogin, apiRegister } from '@/store/useAuthStore';

export function AuthPage() {
  const navigate   = useNavigate();
  const [params]   = useSearchParams();
  const { login }  = useAuthStore();

  const [tab,     setTab]    = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error,   setError]  = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // Login
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');

  // Register
  const [rName,    setRName]    = useState('');
  const [rEmpresa, setREmpresa] = useState('');
  const [rEmail,   setREmail]   = useState('');
  const [rPwd,     setRPwd]     = useState('');

  const redirectTo = params.get('redirect') ?? '/dashboard';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const d = await apiLogin(email, password);
      login(d.token, d.refreshToken, {
        userId:   d.userId,
        name:     d.name,
        email:    d.email,
        role:     d.role,
        plan:     d.plan ?? d.planTier ?? 'FREE',
        planTier: d.planTier,
        tenantId: d.tenantId ?? 'contracts',
      });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      // 1. Create account
      await apiRegister(rName, rEmail, rPwd);
      // 2. Auto-login to get token
      const d = await apiLogin(rEmail, rPwd);
      login(d.token, d.refreshToken, {
        userId:   d.userId,
        name:     d.name,
        email:    d.email,
        role:     d.role,
        plan:     d.plan ?? d.planTier ?? 'FREE',
        planTier: d.planTier,
        tenantId: d.tenantId ?? 'contracts',
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrarse');
    } finally { setLoading(false); }
  };

  const ic = `w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3
    text-white placeholder-stone-600 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors`;

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4 pt-14">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-400 flex items-center justify-center">
              <FileSearch className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-semibold text-lg">
              ColombiaTIC <span className="text-emerald-400">Contracts</span>
            </span>
          </Link>
          <p className="text-stone-500 text-sm">
            {tab === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta gratuita'}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex bg-white/5 rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-emerald-500 text-white' : 'text-stone-400 hover:text-white'
              }`}>
              {t === 'login' ? 'Iniciar sesión' : 'Registrarse'}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {/* ── LOGIN ── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type="email" placeholder="correo@empresa.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={ic} />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type={showPwd ? 'text' : 'password'} placeholder="Contraseña"
                value={password} onChange={(e) => setPassword(e.target.value)} required
                autoComplete="current-password" className={`${ic} pr-10`} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
                py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Entrando...' : 'Iniciar sesión'}
            </button>
          </form>
        )}

        {/* ── REGISTER ── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type="text" placeholder="Nombre completo" value={rName}
                onChange={(e) => setRName(e.target.value)} required className={ic} />
            </div>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type="text" placeholder="Nombre de la empresa (opcional)" value={rEmpresa}
                onChange={(e) => setREmpresa(e.target.value)} className={ic} />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type="email" placeholder="correo@empresa.com" value={rEmail}
                onChange={(e) => setREmail(e.target.value)} required autoComplete="email" className={ic} />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 pointer-events-none" />
              <input type={showPwd ? 'text' : 'password'} placeholder="Contraseña (mín. 6 caracteres)"
                value={rPwd} onChange={(e) => setRPwd(e.target.value)} required minLength={6}
                autoComplete="new-password" className={`${ic} pr-10`} />
              <button type="button" onClick={() => setShowPwd(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
                py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
            <p className="text-stone-600 text-xs text-center leading-relaxed">
              Al registrarte aceptas{' '}
              <Link to="/terminos" className="text-emerald-600 hover:text-emerald-400">Términos</Link>
              {' '}y{' '}
              <Link to="/privacidad" className="text-emerald-600 hover:text-emerald-400">Privacidad</Link>
            </p>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/pricing" className="text-xs text-stone-600 hover:text-emerald-400 transition-colors">
            Ver Plan PRO Licitador → $149.000/mes
          </Link>
        </div>
      </div>
    </div>
  );
}
