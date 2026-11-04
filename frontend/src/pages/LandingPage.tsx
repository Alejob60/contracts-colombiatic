import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { SearchBar } from '@/components/search/SearchBar';
import { ResultCard } from '@/components/search/ResultCard';
import { PlanCard } from '@/components/pricing/PlanCard';
import {
  Search, Shield, Zap, Bell, FileText, Users,
  BarChart3, ArrowRight, CheckCircle2, RefreshCw,
  FileUp, Bot, AlertCircle, Clock
} from 'lucide-react';
import { CONTRACTS_PRICING } from '@/lib/constants/pricing';
import type { SecopProcessCard } from '@/types/secop';

const MOCK_RESULTS: SecopProcessCard[] = [
  {
    proceso_id: 'CO1.REQ.DEMO1',
    entidad: 'ALCALDÍA MUNICIPAL DE CALI',
    nit_entidad: '800336534',
    departamento_entidad: 'Valle del Cauca',
    ciudad_entidad: 'Cali',
    nombre_del_procedimiento: 'DESARROLLO E IMPLEMENTACIÓN DE PLATAFORMA DIGITAL PARA GESTIÓN DE TRÁMITES CIUDADANOS — SECRETARÍA DE TIC',
    descripcion: 'Contratar el desarrollo e implementación de una plataforma digital que permita la gestión en línea de trámites y servicios ciudadanos de la Alcaldía de Cali.',
    precio_base: '450000000',
    modalidad: 'Licitación pública',
    tipo_contrato: 'Prestación de servicios',
    estado: 'Convocado',
    codigo_unspsc: 'V1.81162000',
    url_proceso: 'https://community.secop.gov.co',
    fecha_publicacion: new Date().toISOString(),
    duracion: 6,
    unidad_duracion: 'mes(es)',
  },
  {
    proceso_id: 'CO1.REQ.DEMO2',
    entidad: 'GOBERNACIÓN DEL VALLE DEL CAUCA',
    nit_entidad: '890399477',
    departamento_entidad: 'Valle del Cauca',
    ciudad_entidad: 'Cali',
    nombre_del_procedimiento: 'SUMINISTRO DE EQUIPOS DE CÓMPUTO Y TECNOLOGÍA PARA DEPENDENCIAS ADMINISTRATIVAS DE LA GOBERNACIÓN',
    descripcion: null,
    precio_base: null,
    modalidad: 'Selección abreviada',
    tipo_contrato: 'Suministro',
    estado: 'Publicado',
    codigo_unspsc: 'V1.43211700',
    url_proceso: null,
    fecha_publicacion: new Date(Date.now() - 86400000 * 2).toISOString(),
    duracion: 30,
    unidad_duracion: 'día(s)',
  },
  {
    proceso_id: 'CO1.REQ.DEMO3',
    entidad: 'ECOPETROL S.A.',
    nit_entidad: '899999068',
    departamento_entidad: 'Bogotá D.C.',
    ciudad_entidad: 'Bogotá',
    nombre_del_procedimiento: 'CONSULTORÍA PARA DIAGNÓSTICO Y PLAN DE MODERNIZACIÓN DE INFRAESTRUCTURA TECNOLÓGICA',
    descripcion: null,
    precio_base: null,
    modalidad: 'Concurso de méritos',
    tipo_contrato: 'Consultoría',
    estado: 'En evaluación',
    codigo_unspsc: 'V1.81111600',
    url_proceso: null,
    fecha_publicacion: new Date(Date.now() - 86400000 * 5).toISOString(),
    duracion: 90,
    unidad_duracion: 'día(s)',
  },
];

const SERVICES = [
  {
    icon: Search,
    badge: 'LIVE',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    title: 'Buscar',
    headline: 'Encuentra licitaciones que tu empresa puede ganar',
    description: 'Accede a 5M+ procesos de SECOP II. Filtra por departamento, modalidad, tipo de contrato y presupuesto. Resultados en segundos.',
    features: [
      'Búsqueda en texto libre y por código UNSPSC',
      'Filtros avanzados por departamento y modalidad',
      '3 búsquedas gratuitas por día, sin registro',
      'Resultados completos con enlaces directos SECOP II',
    ],
  },
  {
    icon: Bot,
    badge: 'PRO',
    badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    title: 'Evaluar',
    headline: 'IA que te dice si puedes ganar antes de licitar',
    description: 'El agente analiza el pliego de condiciones, cruza los requisitos con tu RUP y documentos corporativos, y te da el diagnóstico completo.',
    features: [
      'Match Score 0–100% automático por proceso',
      'Checklist de habilitación (experiencia, finanzas, certificados)',
      'Matriz de riesgos con severidad Alta/Media/Baja',
      'Plan de acción paso a paso para subsanar faltantes',
    ],
  },
  {
    icon: FileText,
    badge: 'PRO',
    badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    title: 'Preparar',
    headline: 'Tu perfil corporativo potencia la IA',
    description: 'Sube tu RUP, estados financieros y certificados. La IA los usa para evaluar cada licitación contra tu capacidad real.',
    features: [
      'Carga ilimitada de documentos corporativos',
      'Indexación automática con IA (embeddings vectoriales)',
      'Gestión de códigos UNSPSC y capacidad K',
      '"Visto Bueno" de empresa para cada proceso',
    ],
  },
  {
    icon: Bell,
    badge: 'PRO',
    badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    title: 'Alertas',
    headline: 'Nunca te pierdas una licitación compatible',
    description: 'Configura alertas por WhatsApp o email. Recibe notificación automática cuando aparece un proceso con más del 80% de match con tu perfil.',
    features: [
      'Alertas WhatsApp y email personalizadas',
      'Umbral configurable de match (default 80%)',
      'Filtros por UNSPSC, departamento y presupuesto',
      'Frecuencia: tiempo real, diaria o semanal',
    ],
  },
  {
    icon: RefreshCw,
    badge: 'PRÓXIMAMENTE',
    badgeColor: 'bg-stone-500/20 text-stone-400 border-stone-500/30',
    title: 'Reportar',
    headline: 'SECOP II → SIA OBSERVA sin re-digitar',
    description: 'Para contratistas con contratos activos. Expedito sincroniza, nosotros lo hacemos con IA. Reporte mensual automático, cero transcripción.',
    features: [
      'Sincronización mensual automática SECOP II → SIA OBSERVA',
      'Alerta de discrepancias antes de cerrar el reporte',
      'Compatible con OPS, interventores y multi-contrato',
      'Soporte SIA Contralorías y SIRECI',
    ],
  },
  {
    icon: FileUp,
    badge: 'PRÓXIMAMENTE',
    badgeColor: 'bg-stone-500/20 text-stone-400 border-stone-500/30',
    title: 'Publicar',
    headline: 'Cuenta de cobro y contratos a SECOP II en un clic',
    description: 'Sube el PDF. La IA extrae los campos, los valida y publica en SECOP II. Lo que antes tomaba dos horas, ahora toma un clic.',
    features: [
      'Extracción inteligente de PDF con IA',
      'Validación de campos obligatorios antes de publicar',
      'Revisión previa — tú apruebas antes de enviar',
      'Registro de auditoría de cada publicación',
    ],
  },
];

const HOW_IT_WORKS = [
  { step: '01', icon: Search, title: 'Busca sin registro', description: 'Escribe tu actividad —"desarrollo de software", "obra civil", "suministro equipos"— y el sistema filtra los procesos abiertos en SECOP II. 3 búsquedas gratis.' },
  { step: '02', icon: Bot, title: 'La IA evalúa el pliego', description: 'Con Plan PRO, el agente cruza el pliego de condiciones con tu RUP y documentos corporativos. Resultado: Match Score, checklist y plan de acción.' },
  { step: '03', icon: Bell, title: 'Recibe alertas automáticas', description: 'Configura tu perfil una vez. Cada vez que aparezca un proceso compatible, te llega la alerta a WhatsApp antes de que lo vea la competencia.' },
  { step: '04', icon: RefreshCw, title: 'Gestiona y reporta', description: 'Con el módulo Reportar (próximamente) sincronizas tus contratos activos con SIA OBSERVA automáticamente, sin re-digitar un solo campo.' },
];

const STATS = [
  { value: '5M+', label: 'Procesos SECOP II indexados' },
  { value: '32', label: 'Departamentos cubiertos' },
  { value: '< 2s', label: 'Tiempo de respuesta' },
  { value: '24/7', label: 'Actualización automática' },
];

const FAQS = [
  {
    q: '¿Qué es SECOP II?',
    a: 'SECOP II (Sistema Electrónico de Contratación Pública) es la plataforma transaccional del gobierno colombiano para gestionar contratos estatales. Todas las entidades públicas publican sus procesos de licitación allí. Tiene más de 5 millones de procesos registrados.',
  },
  {
    q: '¿Para quién es ColombiaTIC Contracts?',
    a: 'Para empresas y contratistas colombianos que participan en licitaciones públicas: firmas de ingeniería, empresas de TI, proveedores de suministros, OPS, interventores. Cualquiera que compita por contratos estatales en Colombia.',
  },
  {
    q: '¿Cómo funciona el evaluador IA?',
    a: 'Usamos inteligencia artificial (AWS Bedrock, Claude) para leer el pliego de condiciones de la licitación y compararlo con los documentos de tu empresa (RUP, estados financieros, certificados). El resultado es un diagnóstico con Match Score, checklist de habilitación y plan de acción.',
  },
  {
    q: '¿Es gratis?',
    a: 'Sí, tienes 3 búsquedas gratuitas por día sin registro. Para búsquedas ilimitadas, el evaluador IA, las alertas y los demás módulos, el Plan PRO Licitador cuesta $149.000 COP/mes o $1.431.600/año (20% de descuento).',
  },
  {
    q: '¿Qué pasa con mis documentos corporativos?',
    a: 'Tus documentos se almacenan cifrados en AWS S3 (cuenta colombiatic, us-east-1) y solo se usan para alimentar el análisis IA de tus propios procesos. No los compartimos con terceros. Ver Política de Privacidad para el detalle completo bajo Ley 1581/2012.',
  },
  {
    q: '¿Usan inteligencia artificial para procesar mis datos?',
    a: 'Sí. Usamos modelos de lenguaje (Claude de Anthropic, disponible en AWS Bedrock) para analizar pliegos de condiciones y documentos corporativos. El sistema nunca publica ni comparte automáticamente — siempre revisas antes de cualquier acción. Ver nuestra Política de Uso de IA.',
  },
];

export function LandingPage() {
  return (
    <div className="bg-brand-navy">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center justify-center px-4 pt-20 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-dark-grid bg-[size:40px_40px] opacity-40 pointer-events-none" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px]
          bg-emerald-500/4 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <span className="inline-block px-4 py-1.5 mb-6 border border-emerald-500/30 rounded-full
              text-emerald-400 text-xs font-mono font-bold tracking-[0.2em] uppercase bg-emerald-500/5">
              ✦ SECOP II · Contratación Pública Colombia
            </span>

            <h1 className="font-serif font-bold text-5xl md:text-6xl lg:text-7xl text-white mb-5 leading-tight">
              Encuentra, evalúa y gana{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                licitaciones
              </span>
              {' '}con IA
            </h1>

            <p className="text-stone-400 text-lg md:text-xl max-w-2xl mx-auto mb-3 leading-relaxed">
              La plataforma inteligente para el ciclo completo de contratación pública en Colombia.
              Desde encontrar la oportunidad hasta reportar en SIA OBSERVA.
            </p>
            <p className="text-stone-500 text-sm mb-10">
              <span className="text-emerald-400 font-medium">3 búsquedas gratis</span>
              {' '}· Sin tarjeta de crédito · Para contratistas colombianos
            </p>

            <div className="max-w-2xl mx-auto mb-10">
              <SearchBar
                size="large"
                placeholder='Ej: "Desarrollo de software Cali" · "Obra civil Antioquia" · "Suministro equipos"'
              />
            </div>

            <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-stone-500">
              {STATS.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="text-white font-bold">{s.value}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Results preview ──────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-10"
          >
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-white mb-3">
              Resultados reales de SECOP II
            </h2>
            <p className="text-stone-400 text-sm">Datos en vivo desde datos.gov.co · Actualización diaria</p>
          </motion.div>

          <div className="space-y-3 mb-7">
            {MOCK_RESULTS.map((proc, idx) => (
              <motion.div
                key={proc.proceso_id}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.08 }}
              >
                <ResultCard process={proc} isBlurred={idx === 2} onUpgrade={() => window.location.assign('/auth')} />
              </motion.div>
            ))}
          </div>

          <p className="text-center text-stone-600 text-xs mb-4">
            El tercer resultado está protegido. <Link to="/auth" className="text-emerald-500 hover:text-emerald-400">Regístrate gratis</Link> para desbloquearlo.
          </p>
          <div className="text-center">
            <Link to="/buscar"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm">
              Buscar licitaciones abiertas ahora <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 6 Services ───────────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5 bg-brand-dark/30" id="servicios">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-14"
          >
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-white mb-3">
              El ciclo completo de contratación pública
            </h2>
            <p className="text-stone-400 max-w-2xl mx-auto text-sm leading-relaxed">
              Desde encontrar la licitación hasta reportar en SIA OBSERVA. La primera plataforma colombiana que cubre las 6 etapas con inteligencia artificial.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {SERVICES.map((svc, idx) => (
              <motion.div
                key={svc.title}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.06 }}
                className="bg-white/[0.02] border border-white/8 rounded-2xl p-6
                  hover:border-emerald-500/20 hover:bg-white/[0.04] transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center
                    group-hover:bg-emerald-500/15 transition-colors">
                    <svc.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${svc.badgeColor}`}>
                    {svc.badge}
                  </span>
                </div>
                <h3 className="text-white font-semibold text-lg mb-1">{svc.title}</h3>
                <p className="text-emerald-400/80 text-xs font-medium mb-2 leading-snug">{svc.headline}</p>
                <p className="text-stone-500 text-xs leading-relaxed mb-4">{svc.description}</p>
                <ul className="space-y-1.5">
                  {svc.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-stone-400">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-14"
          >
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-white mb-3">
              Cómo funciona
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {HOW_IT_WORKS.map((step, idx) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.08 }}
                className="text-center"
              >
                <div className="text-5xl font-serif font-bold text-emerald-500/15 mb-3">{step.step}</div>
                <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <step.icon className="w-4 h-4 text-emerald-400" />
                </div>
                <h3 className="text-white font-semibold text-sm mb-2">{step.title}</h3>
                <p className="text-stone-500 text-xs leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain points / "Deja de" ───────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5 bg-brand-dark/40">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-12"
          >
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-white mb-3">
              Diseñado para contratistas colombianos
            </h2>
            <p className="text-stone-400 text-sm">Entendemos el papeleo porque lo vivimos.</p>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { before: 'Buscar manualmente en SECOP II por horas', after: 'Resultados filtrados en segundos', icon: Clock },
              { before: 'Leer 200 páginas de pliego para saber si aplicas', after: 'Diagnóstico IA en minutos con Match Score', icon: FileText },
              { before: 'Enterarte tarde de licitaciones compatibles', after: 'Alerta a WhatsApp antes que la competencia', icon: Bell },
              { before: 'Re-digitar datos de SECOP II en SIA OBSERVA cada mes', after: 'Sincronización automática sin tocar un campo', icon: RefreshCw },
            ].map((item, idx) => (
              <motion.div
                key={item.before}
                initial={{ opacity: 0, x: idx % 2 === 0 ? -15 : 15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.07 }}
                className="bg-white/[0.02] border border-white/8 rounded-2xl p-5"
              >
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400/60 shrink-0" />
                  <p className="text-stone-600 text-xs line-through">{item.before}</p>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <p className="text-stone-200 text-sm font-medium">{item.after}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5">
        <div className="max-w-lg mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-10"
          >
            <h2 className="font-serif font-bold text-3xl md:text-4xl text-white mb-3">
              Un solo plan. Todo incluido.
            </h2>
            <p className="text-stone-400 text-sm">Sin tarifas ocultas. Sin límites por módulo.</p>
          </motion.div>
          <PlanCard pricing={CONTRACTS_PRICING} />
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 border-t border-white/5 bg-brand-dark/30">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} className="text-center mb-12"
          >
            <h2 className="font-serif font-bold text-3xl text-white mb-2">Preguntas frecuentes</h2>
          </motion.div>
          <div className="space-y-3">
            {FAQS.map((faq, idx) => (
              <motion.details
                key={faq.q}
                initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: idx * 0.05 }}
                className="group bg-white/[0.02] border border-white/8 rounded-xl p-5 cursor-pointer
                  hover:border-white/12 transition-colors"
              >
                <summary className="text-white font-medium text-sm list-none flex items-center justify-between gap-3">
                  {faq.q}
                  <span className="text-stone-500 group-open:rotate-45 transition-transform text-lg leading-none shrink-0">+</span>
                </summary>
                <p className="text-stone-400 text-sm mt-3 leading-relaxed">{faq.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* ── IA disclosure notice ─────────────────────────────────────────── */}
      <section className="py-8 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-4 flex gap-3">
            <Bot className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-stone-400 text-xs leading-relaxed">
              <span className="text-amber-400 font-medium">Uso de Inteligencia Artificial: </span>
              Esta plataforma utiliza modelos de IA (Claude de Anthropic via AWS Bedrock) para analizar
              documentos y generar evaluaciones. La IA asiste en la toma de decisiones pero{' '}
              <strong className="text-stone-300">no reemplaza el criterio profesional ni legal</strong>{' '}
              del usuario. Siempre revisa los resultados antes de actuar.{' '}
              <Link to="/politica-ia" className="text-amber-400 hover:text-amber-300 underline">Ver Política de IA →</Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="py-24 px-4 border-t border-white/5 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="max-w-2xl mx-auto"
        >
          <h2 className="font-serif font-bold text-4xl md:text-5xl text-white mb-4 leading-tight">
            Empieza a encontrar contratos hoy
          </h2>
          <p className="text-stone-400 text-lg mb-8">
            3 búsquedas gratuitas. Sin tarjeta de crédito. Sin instalación.
          </p>
          <Link to="/buscar"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-bold px-8 py-4 rounded-2xl hover:opacity-90 transition-opacity text-base mb-4">
            Buscar licitaciones gratis <ArrowRight className="w-5 h-5" />
          </Link>
          <div className="flex flex-wrap justify-center gap-4 text-stone-600 text-xs mt-4">
            <Link to="/privacidad" className="hover:text-stone-400 transition-colors">Política de Privacidad</Link>
            <Link to="/terminos" className="hover:text-stone-400 transition-colors">Términos de Uso</Link>
            <Link to="/politica-ia" className="hover:text-stone-400 transition-colors">Política de IA</Link>
            <Link to="/cookies" className="hover:text-stone-400 transition-colors">Cookies</Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
