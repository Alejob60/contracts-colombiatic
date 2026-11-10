/**
 * DashboardSidebar — Sprint 16.
 *
 * Collapsible left navigation for the dashboard.
 * - Expanded (240px): icon + label + badges
 * - Collapsed (64px): icon only with tooltips
 * - Mobile: overlay with hamburger toggle
 *
 * Persists collapse state in localStorage.
 * Auto-collapses on mobile viewport (< 1024px).
 */
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Search, User, Bookmark, FileText, Bot, Bell, BarChart3,
  Users, Package, PlusCircle, Zap, ChevronLeft, ChevronRight,
  Home, Menu, X, Lock, Settings, TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { UsageMeter } from '@/components/usage/UsageMeter';

// ── Nav item definition ───────────────────────────────────────────────────

interface NavItem {
  icon:    typeof Home;
  label:   string;
  path:    string;
  badge?:  number;
  proOnly: boolean;
  group:   string;
}

const NAV_ITEMS: NavItem[] = [
  // Descubrir
  { icon: Home,        label: 'Dashboard',         path: '/dashboard',                    proOnly: false, group: 'dashboard' },
  { icon: Search,      label: 'Buscador SECOP',    path: '/buscar',                       proOnly: false, group: 'descubrir' },
  { icon: Bell,        label: 'Alertas',           path: '/dashboard/alertas',            proOnly: true,  group: 'descubrir' },
  { icon: PlusCircle,  label: 'Proceso externo',   path: '/dashboard/proceso-externo',    proOnly: true,  group: 'descubrir' },
  // Mi empresa
  { icon: User,        label: 'Perfil empresa',    path: '/dashboard/perfil',             proOnly: false, group: 'empresa' },
  { icon: FileText,    label: 'Documentos RAG',    path: '/dashboard/documentos',         proOnly: true,  group: 'empresa' },
  { icon: TrendingUp,  label: 'Capacidad K',       path: '/dashboard/k-residual',         proOnly: false, group: 'empresa' },
  // Licitaciones
  { icon: Bookmark,    label: 'Guardados',         path: '/dashboard/guardados',          proOnly: false, group: 'licitaciones' },
  { icon: Package,     label: 'Workspace',         path: '/dashboard/guardados',          proOnly: true,  group: 'licitaciones' },
  { icon: Bot,         label: 'Evaluaciones IA',   path: '/dashboard/evaluaciones',       proOnly: true,  group: 'licitaciones' },
  // Ecosistema
  { icon: Users,       label: 'Red B2B',           path: '/dashboard/b2b',                proOnly: false, group: 'ecosistema' },
  // Herramientas
  { icon: BarChart3,   label: 'Analítica',         path: '/dashboard/analitica',          proOnly: true,  group: 'herramientas' },
  { icon: Settings,    label: 'Integración SECOP', path: '/dashboard/integracion-secop',  proOnly: true,  group: 'herramientas' },
];

const GROUP_LABELS: Record<string, string> = {
  dashboard:    '',
  descubrir:    'Descubrir',
  empresa:      'Mi empresa',
  licitaciones: 'Licitaciones',
  ecosistema:   'Ecosistema',
  herramientas: 'Herramientas',
};

// ── Sidebar component ─────────────────────────────────────────────────────

interface DashboardSidebarProps {
  collapsed:  boolean;
  onToggle:   () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function DashboardSidebar({
  collapsed, onToggle, mobileOpen, onMobileClose,
}: DashboardSidebarProps) {
  const location = useLocation();
  const { user, isPro, logout } = useAuthStore();

  const isActive = (path: string) => {
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const groups = [...new Set(NAV_ITEMS.map(i => i.group))];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + toggle */}
      <div className={`flex items-center justify-between p-3 border-b border-white/8
        ${collapsed ? 'px-3' : 'px-4'}`}>
        {!collapsed && (
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center">
              <Search className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-bold text-sm">Contracts</span>
          </Link>
        )}
        {collapsed && (
          <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center mx-auto">
            <Search className="w-3.5 h-3.5 text-white" />
          </div>
        )}
        {/* Toggle button — only on desktop */}
        <button
          onClick={onToggle}
          className="hidden lg:flex p-1.5 text-stone-500 hover:text-white
            hover:bg-white/5 rounded-lg transition-colors ml-auto">
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {groups.map((group, gi) => {
          const items = NAV_ITEMS.filter(i => i.group === group);
          const label = GROUP_LABELS[group];
          return (
            <div key={group} className={gi > 0 ? 'mt-2' : ''}>
              {label && !collapsed && (
                <p className="text-[10px] text-stone-700 uppercase tracking-wider font-medium
                  px-2 mb-1 mt-3">
                  {label}
                </p>
              )}
              {label && collapsed && <div className="h-px bg-white/5 mx-2 mb-1 mt-3" />}
              {items.map(item => {
                const active = isActive(item.path);
                const locked = item.proOnly && !isPro;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path + item.label}
                    to={locked ? '/pricing' : item.path}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-xl
                      transition-all mb-0.5 group relative
                      ${active
                        ? 'bg-emerald-500/15 text-white border-l-2 border-emerald-500 -ml-0 pl-[9px]'
                        : locked
                        ? 'text-stone-700 hover:bg-white/5 hover:text-stone-500'
                        : 'text-stone-400 hover:bg-white/5 hover:text-white'
                      }
                      ${collapsed ? 'justify-center px-2' : ''}`}>
                    <Icon className={`shrink-0 ${active ? 'w-4 h-4' : 'w-4 h-4'}`} />
                    {!collapsed && (
                      <>
                        <span className="text-sm font-medium truncate">{item.label}</span>
                        {locked && (
                          <Lock className="w-3 h-3 text-stone-700 ml-auto shrink-0" />
                        )}
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="ml-auto text-[10px] bg-emerald-500/20 text-emerald-400
                            px-1.5 py-0.5 rounded-full font-mono">
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                    {/* Tooltip for collapsed */}
                    {collapsed && (
                      <div className="absolute left-full ml-3 px-2 py-1 bg-[#0F1929] border
                        border-white/10 rounded-lg text-xs text-white whitespace-nowrap
                        opacity-0 group-hover:opacity-100 pointer-events-none z-50
                        transition-opacity">
                        {item.label}
                        {locked && ' 🔒'}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Usage meter (compact) */}
      {!collapsed && (
        <div className="px-3 pb-2 border-t border-white/8 pt-3">
          <UsageMeter />
        </div>
      )}

      {/* User info */}
      <div className={`p-3 border-t border-white/8 flex items-center gap-2
        ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-7 h-7 bg-emerald-500/20 rounded-full flex items-center justify-center
          shrink-0 text-emerald-400 text-xs font-bold">
          {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">
              {user?.name || user?.email?.split('@')[0] || 'Usuario'}
            </p>
            <p className={`text-[10px] ${isPro ? 'text-emerald-500' : 'text-stone-600'}`}>
              {isPro ? '⚡ PRO' : 'Plan gratuito'}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-[64px] h-[calc(100vh-64px)]
          bg-[#080f1a] border-r border-white/8 z-30 transition-all duration-200
          ${collapsed ? 'w-16' : 'w-60'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-60 bg-[#080f1a] border-r border-white/8 flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-white/8">
              <span className="text-white font-bold text-sm">Menú</span>
              <button onClick={onMobileClose}
                className="p-1.5 text-stone-400 hover:text-white rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebarContent}
          </div>
          <div className="flex-1 bg-black/50" onClick={onMobileClose} />
        </div>
      )}
    </>
  );
}

// ── Mobile trigger button ─────────────────────────────────────────────────
// Used in DashboardPage to show sidebar on mobile

export function MobileSidebarTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden fixed bottom-6 left-4 z-40 w-12 h-12 bg-emerald-500
        rounded-2xl flex items-center justify-center shadow-lg
        hover:bg-emerald-400 transition-colors">
      <Menu className="w-5 h-5 text-white" />
    </button>
  );
}
