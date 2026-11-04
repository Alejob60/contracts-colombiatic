import { Link } from 'react-router-dom';

const LAST_UPDATED = '4 de noviembre de 2026';
const EMAIL = 'dairagarzon@colombiatic.com.co';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-semibold text-xl text-white mb-3 border-b border-white/8 pb-2">{title}</h2>
      <div className="text-stone-400 text-sm leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

const COOKIES_TABLE = [
  { nombre: 'contracts_token', tipo: 'Esencial', duracion: '7 días', proposito: 'Autenticación del usuario. Contiene el JWT de sesión.' },
  { nombre: 'contracts_session', tipo: 'Esencial', duracion: '24 horas', proposito: 'Identificador de sesión anónima para el contador freemium.' },
  { nombre: '_ga, _gid', tipo: 'Analítica', duracion: '2 años / 24 h', proposito: 'Google Analytics — estadísticas de uso anónimas.' },
  { nombre: 'cookie_consent', tipo: 'Preferencia', duracion: '1 año', proposito: 'Guarda la preferencia de consentimiento del usuario.' },
];

export function CookiesPage() {
  return (
    <div className="min-h-screen bg-brand-navy pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <p className="text-stone-500 text-xs mb-2">Última actualización: {LAST_UPDATED}</p>
        <h1 className="text-3xl font-bold text-white mb-1">Política de Cookies</h1>
        <p className="text-emerald-400 text-sm font-medium mb-8">
          Circular Única SIC · Ley 1581/2012 · Directiva ePrivacy (referencia)
        </p>

        <Section title="1. ¿Qué son las cookies?">
          <p>Las cookies son pequeños archivos de texto que se almacenan en tu navegador cuando visitas
          un sitio web. Permiten que el sitio recuerde tus preferencias y estado de sesión entre visitas.</p>
        </Section>

        <Section title="2. Cookies que utilizamos">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-4 text-stone-300 font-medium">Cookie</th>
                  <th className="text-left py-2 pr-4 text-stone-300 font-medium">Tipo</th>
                  <th className="text-left py-2 pr-4 text-stone-300 font-medium">Duración</th>
                  <th className="text-left py-2 text-stone-300 font-medium">Propósito</th>
                </tr>
              </thead>
              <tbody>
                {COOKIES_TABLE.map((c) => (
                  <tr key={c.nombre} className="border-b border-white/5 hover:bg-white/[0.01]">
                    <td className="py-2.5 pr-4 font-mono text-emerald-400">{c.nombre}</td>
                    <td className="py-2.5 pr-4 text-stone-300">{c.tipo}</td>
                    <td className="py-2.5 pr-4 text-stone-400 whitespace-nowrap">{c.duracion}</td>
                    <td className="py-2.5 text-stone-500">{c.proposito}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="3. Cookies esenciales (no se pueden desactivar)">
          <p>Las cookies <code className="text-emerald-400 bg-white/5 px-1 py-0.5 rounded text-xs">contracts_token</code> y{' '}
          <code className="text-emerald-400 bg-white/5 px-1 py-0.5 rounded text-xs">contracts_session</code> son
          estrictamente necesarias para el funcionamiento del servicio. Sin ellas, no es posible mantener
          la sesión iniciada ni controlar el límite freemium de 3 búsquedas gratuitas.</p>
        </Section>

        <Section title="4. Cookies analíticas (opcionales)">
          <p>Usamos Google Analytics (GA4) para entender cómo se usa la plataforma de forma agregada y anónima.
          Los datos no permiten identificar a usuarios individuales.</p>
          <p>Puedes desactivar las cookies analíticas ajustando las preferencias de tu navegador o usando
          la <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer"
          className="text-emerald-400 hover:text-emerald-300">extensión de exclusión de Google Analytics</a>.</p>
        </Section>

        <Section title="5. Cómo controlar las cookies">
          <p>Puedes configurar o deshabilitar cookies desde la configuración de tu navegador:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/es/kb/habilitar-y-deshabilitar-cookies-sitios-web" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:text-emerald-300">Safari</a></li>
          </ul>
          <p>Ten en cuenta que deshabilitar cookies esenciales puede impedir el funcionamiento correcto de la plataforma.</p>
        </Section>

        <Section title="6. Actualizaciones">
          <p>Podemos actualizar esta política. Los cambios se publicarán en esta página con la fecha de actualización.</p>
        </Section>

        <div className="mt-10 pt-6 border-t border-white/5 flex flex-wrap gap-4 text-xs text-stone-600">
          <Link to="/privacidad" className="hover:text-stone-400">Política de Privacidad</Link>
          <Link to="/terminos" className="hover:text-stone-400">Términos de Uso</Link>
          <p className="text-stone-700">Contacto: {EMAIL}</p>
        </div>
      </div>
    </div>
  );
}
