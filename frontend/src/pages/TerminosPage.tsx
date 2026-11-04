import { Link } from 'react-router-dom';

const LAST_UPDATED = '4 de noviembre de 2026';
const RESPONSIBLE = 'ColombiaTIC SAS';
const EMAIL = 'dairagarzon@colombiatic.com.co';
const SITE = 'contracts.colombiatic.com.co';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-serif font-semibold text-xl text-white mb-3 border-b border-white/8 pb-2">{title}</h2>
      <div className="text-stone-400 text-sm leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

export function TerminosPage() {
  return (
    <div className="min-h-screen bg-brand-navy pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <p className="text-stone-500 text-xs mb-2">Última actualización: {LAST_UPDATED}</p>
        <h1 className="font-serif text-3xl font-bold text-white mb-1">Términos y Condiciones de Uso</h1>
        <p className="text-emerald-400 text-sm font-medium mb-8">
          Ley 527/1999 (Comercio Electrónico) · Ley 1480/2011 (Estatuto del Consumidor)
        </p>

        <Section title="1. Partes y Aceptación">
          <p>Estos Términos rigen la relación entre <strong className="text-white">{RESPONSIBLE}</strong>
          {' '}("ColombiaTIC Contracts" o "la Plataforma") y el usuario que accede a{' '}
          <span className="text-emerald-400">https://{SITE}</span>.</p>
          <p>Al usar la Plataforma, el usuario acepta estos Términos. Si no los acepta, debe
          abstenerse de usar el servicio.</p>
        </Section>

        <Section title="2. Descripción del Servicio">
          <p>ColombiaTIC Contracts es una plataforma SaaS de inteligencia en contratación pública que ofrece:</p>
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>Búsqueda en la API pública de SECOP II (datos.gov.co).</li>
            <li>Evaluación de factibilidad de licitaciones con inteligencia artificial.</li>
            <li>Gestión de perfil corporativo y documentos (Plan PRO).</li>
            <li>Alertas automáticas por WhatsApp y email (Plan PRO).</li>
            <li>Automatización de reportes SIA OBSERVA y publicación SECOP II (próximamente).</li>
          </ul>
          <p>La información proviene de fuentes públicas (datos.gov.co — SECOP II). La Plataforma
          no es una entidad pública ni tiene afiliación oficial con Colombia Compra Eficiente,
          la Contraloría General ni el DAFP.</p>
        </Section>

        <Section title="3. Registro y Cuentas">
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>El usuario debe tener al menos 18 años y capacidad legal para contratar.</li>
            <li>La información proporcionada en el registro debe ser veraz y actualizada.</li>
            <li>El usuario es responsable de la confidencialidad de sus credenciales.</li>
            <li>Una cuenta no puede ser transferida ni cedida a terceros.</li>
            <li>ColombiaTIC se reserva el derecho de suspender cuentas que violen estos Términos.</li>
          </ul>
        </Section>

        <Section title="4. Plan Gratuito y Plan PRO">
          <p><strong className="text-white">Plan Gratuito:</strong> 3 búsquedas por período de 24 horas,
          con resultados parciales. Sin registro obligatorio para las primeras búsquedas.</p>
          <p><strong className="text-white">Plan PRO Licitador:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>Precio: $149.000 COP/mes o $1.431.600 COP/año (IVA incluido).</li>
            <li>Pago mensual o anual por adelantado mediante Wompi (Bancolombia).</li>
            <li>Acceso a todos los módulos activos: Buscar, Evaluar, Preparar y Alertas.</li>
            <li>Cancelación en cualquier momento. Sin permanencia mínima.</li>
            <li>Reembolso: dentro de los 5 días calendario de la fecha de cobro, si no se han usado los módulos PRO.</li>
          </ul>
        </Section>

        <Section title="5. Uso de Inteligencia Artificial — Limitación de Responsabilidad">
          <p>La Plataforma emplea modelos de IA para generar evaluaciones, análisis y recomendaciones.
          <strong className="text-white"> El usuario reconoce y acepta que:</strong></p>
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>Los resultados de la IA son orientativos y no constituyen asesoría jurídica, financiera ni contable.</li>
            <li>La IA puede cometer errores. Siempre valida los resultados con profesionales calificados antes de tomar decisiones de negocio.</li>
            <li>Un Match Score alto no garantiza la adjudicación de un contrato.</li>
            <li>ColombiaTIC no es responsable de decisiones tomadas basándose únicamente en las evaluaciones de la IA.</li>
          </ul>
        </Section>

        <Section title="6. Datos SECOP II — Exactitud">
          <p>La información de procesos de contratación se obtiene de la API pública de{' '}
          <a href="https://datos.gov.co" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">datos.gov.co</a>.
          ColombiaTIC no garantiza la exactitud, integridad o actualidad de los datos.
          Siempre verifica en la plataforma oficial de{' '}
          <a href="https://community.secop.gov.co" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">SECOP II</a>
          {' '}antes de tomar decisiones.</p>
        </Section>

        <Section title="7. Módulos de Automatización — Responsabilidad del Usuario">
          <p>Para los módulos Publicar y Reportar (cuando estén disponibles), el usuario:</p>
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>Autoriza expresamente a ColombiaTIC a actuar en su nombre en SECOP II y SIA OBSERVA.</li>
            <li>Es responsable de revisar la información antes de aprobar cualquier publicación o reporte.</li>
            <li>Garantiza que sus credenciales de SECOP II son propias y no de terceros.</li>
            <li>Exonera a ColombiaTIC de responsabilidad por errores en datos proporcionados por el usuario.</li>
          </ul>
        </Section>

        <Section title="8. Propiedad Intelectual">
          <p>Todo el contenido de la Plataforma (código, diseño, logotipos, textos) es propiedad de
          {RESPONSIBLE} o tiene licencias correspondientes. Queda prohibida su reproducción total o
          parcial sin autorización escrita.</p>
          <p>Los datos de SECOP II son información pública del Estado colombiano, disponibles bajo
          licencia abierta del Gobierno de Colombia.</p>
        </Section>

        <Section title="9. Prohibiciones">
          <p>Está prohibido:</p>
          <ul className="list-disc list-inside space-y-1 text-stone-400">
            <li>Realizar scraping masivo o automatizado de la Plataforma.</li>
            <li>Intentar acceder a cuentas de otros usuarios.</li>
            <li>Usar la Plataforma para actividades ilegales bajo la ley colombiana.</li>
            <li>Revender o sublicenciar el servicio sin autorización.</li>
          </ul>
        </Section>

        <Section title="10. Ley Aplicable y Jurisdicción">
          <p>Estos Términos se rigen por las leyes de la República de Colombia. Para cualquier
          controversia, las partes se someten a la jurisdicción de los Jueces y Tribunales de
          Bogotá D.C., Colombia, con renuncia a cualquier otro fuero.</p>
        </Section>

        <Section title="11. Contacto">
          <p>{RESPONSIBLE} · {EMAIL}</p>
          <p>Para consultas sobre estos Términos, escribe al correo anterior con el asunto "Términos y Condiciones".</p>
        </Section>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-wrap gap-4 text-xs text-stone-600">
          <Link to="/privacidad" className="hover:text-stone-400">Política de Privacidad</Link>
          <Link to="/cookies" className="hover:text-stone-400">Política de Cookies</Link>
          <Link to="/politica-ia" className="hover:text-stone-400">Política de IA</Link>
        </div>
      </div>
    </div>
  );
}
