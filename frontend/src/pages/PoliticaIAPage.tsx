import { Link } from 'react-router-dom';
import { Bot, Eye, ShieldCheck, AlertTriangle, Users, RefreshCw } from 'lucide-react';

const LAST_UPDATED = '4 de noviembre de 2026';
const EMAIL = 'dairagarzon@colombiatic.com.co';

const PRINCIPLES = [
  { icon: Eye, title: 'Transparencia', desc: 'Siempre indicamos cuándo un resultado fue generado por IA, con qué modelo y con qué datos de entrada.' },
  { icon: ShieldCheck, title: 'Supervisión humana', desc: 'La IA asiste. El usuario decide. Ningún módulo actúa de forma autónoma sin aprobación explícita del usuario.' },
  { icon: AlertTriangle, title: 'Responsabilidad acotada', desc: 'Los resultados de IA son orientativos. No reemplazan asesoría jurídica, financiera ni contable certificada.' },
  { icon: Users, title: 'No discriminación', desc: 'Los modelos no toman decisiones sobre personas. Evalúan procesos de contratación, no perfiles humanos.' },
  { icon: RefreshCw, title: 'Mejora continua', desc: 'Monitoreamos la calidad de las evaluaciones y actualizamos los modelos y prompts según evidencia de errores.' },
];

export function PoliticaIAPage() {
  return (
    <div className="min-h-screen bg-brand-navy pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <p className="text-stone-500 text-xs mb-2">Última actualización: {LAST_UPDATED}</p>
        <h1 className="text-3xl font-bold text-white mb-1">Política de Uso de Inteligencia Artificial</h1>
        <p className="text-emerald-400 text-sm font-medium mb-8">
          Transparencia · Supervisión Humana · Responsabilidad
        </p>

        {/* Notice banner */}
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3 mb-10">
          <Bot className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-stone-400 leading-relaxed">
            <p className="text-amber-400 font-medium mb-1">Esta plataforma usa Inteligencia Artificial</p>
            <p>Utilizamos modelos de lenguaje grande (LLM) para analizar documentos y generar evaluaciones.
            Esta política explica cómo, por qué y con qué límites.</p>
          </div>
        </div>

        {/* Principles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="bg-white/[0.02] border border-white/8 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <p.icon className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white font-medium text-sm">{p.title}</h3>
              </div>
              <p className="text-stone-500 text-xs leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Detail sections */}
        {[
          {
            title: '1. Modelos de IA utilizados',
            content: (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 pr-4 text-stone-300 font-medium">Modelo</th>
                      <th className="text-left py-2 pr-4 text-stone-300 font-medium">Proveedor</th>
                      <th className="text-left py-2 text-stone-300 font-medium">Uso en la plataforma</th>
                    </tr>
                  </thead>
                  <tbody className="text-stone-400">
                    {[
                      ['Claude 3 Haiku', 'Anthropic / AWS Bedrock', 'Evaluación de pliegos, análisis de factibilidad, extracción de campos PDF'],
                      ['Titan Embed Text v2', 'Amazon / AWS Bedrock', 'Generación de embeddings vectoriales para búsqueda semántica en documentos corporativos'],
                    ].map(([modelo, proveedor, uso]) => (
                      <tr key={modelo} className="border-b border-white/5">
                        <td className="py-2.5 pr-4 text-emerald-400 font-medium">{modelo}</td>
                        <td className="py-2.5 pr-4">{proveedor}</td>
                        <td className="py-2.5 text-stone-500">{uso}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ),
          },
          {
            title: '2. Qué datos procesa la IA',
            content: (
              <ul className="list-disc list-inside space-y-1 text-stone-400 text-sm">
                <li><strong className="text-white">Pliegos de condiciones SECOP II</strong> — documentos públicos descargados de datos.gov.co.</li>
                <li><strong className="text-white">Documentos corporativos del usuario</strong> — solo los que el usuario carga voluntariamente (RUP, EEFF, certificados). No se procesan sin consentimiento explícito.</li>
                <li><strong className="text-white">Textos de consulta</strong> — el texto de búsqueda ingresado por el usuario para contextualizar evaluaciones.</li>
                <li className="text-stone-500"><em>No se procesa con IA</em>: datos bancarios, credenciales de acceso, documentos personales.</li>
              </ul>
            ),
          },
          {
            title: '3. Cómo funciona el Evaluador de Pliegos',
            content: (
              <ol className="list-decimal list-inside space-y-2 text-stone-400 text-sm">
                <li>Se descarga el pliego de condiciones del proceso SECOP II seleccionado.</li>
                <li>Se recuperan los fragmentos relevantes del RAG corporativo del usuario (embeddings de sus documentos).</li>
                <li>Se construye un prompt estructurado con el pliego + contexto corporativo.</li>
                <li>Claude genera una evaluación en formato JSON estructurado: Match Score, checklist, riesgos, plan de acción.</li>
                <li>El resultado se valida contra un esquema Pydantic antes de mostrarse al usuario.</li>
                <li><strong className="text-white">El usuario siempre ve el resultado ANTES de cualquier acción.</strong></li>
              </ol>
            ),
          },
          {
            title: '4. Limitaciones conocidas de la IA',
            content: (
              <ul className="list-disc list-inside space-y-1 text-stone-400 text-sm">
                <li>Los modelos pueden cometer errores de interpretación en pliegos muy técnicos o especializados.</li>
                <li>Un Match Score alto no garantiza que la empresa cumpla todos los requisitos habilitantes.</li>
                <li>La IA no tiene acceso a bases de datos del SECOP en tiempo real más allá de la API pública.</li>
                <li>Las evaluaciones no tienen validez legal ni pueden usarse como concepto jurídico certificado.</li>
                <li>El rendimiento puede variar con pliegos en formatos no estándar (imágenes escaneadas, PDFs sin OCR).</li>
              </ul>
            ),
          },
          {
            title: '5. Decisiones que la IA NO toma',
            content: (
              <ul className="list-disc list-inside space-y-1 text-stone-400 text-sm">
                <li>La IA no publica nada en SECOP II ni en SIA OBSERVA sin aprobación explícita del usuario.</li>
                <li>La IA no descarta automáticamente licitaciones — solo genera diagnósticos informativos.</li>
                <li>La IA no accede a sistemas externos sin credenciales proporcionadas por el usuario.</li>
                <li>La IA no decide si una empresa es o no apta — solo presenta la evidencia disponible.</li>
              </ul>
            ),
          },
          {
            title: '6. Almacenamiento y retención',
            content: (
              <p className="text-stone-400 text-sm">
                Los prompts enviados a AWS Bedrock <strong className="text-white">no se usan para entrenar modelos</strong> de terceros
                (conforme al acuerdo con AWS). Las evaluaciones generadas se almacenan en la base de datos
                de la plataforma mientras dure la suscripción del usuario + 30 días tras cancelación.
                Ver <Link to="/privacidad" className="text-emerald-400 hover:text-emerald-300">Política de Privacidad</Link> para el detalle completo.
              </p>
            ),
          },
          {
            title: '7. Reporte de errores',
            content: (
              <p className="text-stone-400 text-sm">
                Si encuentras una evaluación incorrecta o un comportamiento inesperado de la IA,
                repórtalo a <strong className="text-white">{EMAIL}</strong> con el asunto "Reporte IA" y una
                descripción del caso. Analizamos todos los reportes para mejorar el sistema.
              </p>
            ),
          },
        ].map((s) => (
          <div key={s.title} className="mb-8">
            <h2 className="font-semibold text-xl text-white mb-3 border-b border-white/8 pb-2">{s.title}</h2>
            {s.content}
          </div>
        ))}

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-wrap gap-4 text-xs text-stone-600">
          <Link to="/privacidad" className="hover:text-stone-400">Política de Privacidad</Link>
          <Link to="/terminos" className="hover:text-stone-400">Términos de Uso</Link>
          <Link to="/cookies" className="hover:text-stone-400">Cookies</Link>
          <p className="text-stone-700">Contacto: {EMAIL}</p>
        </div>
      </div>
    </div>
  );
}
