import { Link } from 'react-router-dom';

const LAST_UPDATED = '4 de noviembre de 2026';
const RESPONSIBLE = 'ColombiaTIC SAS';
const EMAIL = 'dairagarzon@colombiatic.com.co';
const SITE = 'contracts.colombiatic.com.co';

export function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-brand-navy pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto prose prose-invert prose-sm">
        <p className="text-stone-500 text-xs mb-2">Última actualización: {LAST_UPDATED}</p>
        <h1 className="text-3xl font-bold text-white mb-1">
          Política de Privacidad y Tratamiento de Datos Personales
        </h1>
        <p className="text-emerald-400 text-sm font-medium mb-8">
          De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013 — Habeas Data Colombia
        </p>

        <Section title="1. Responsable del Tratamiento">
          <p><strong className="text-white">{RESPONSIBLE}</strong>, con domicilio en Colombia, es el Responsable del
          Tratamiento de los datos personales recolectados a través de{' '}
          <span className="text-emerald-400">{SITE}</span>.</p>
          <ul>
            <li><strong className="text-white">Correo electrónico:</strong> {EMAIL}</li>
            <li><strong className="text-white">Sitio web:</strong> https://{SITE}</li>
          </ul>
        </Section>

        <Section title="2. Datos que Recolectamos">
          <p>Recolectamos los siguientes datos personales:</p>
          <ul>
            <li><strong className="text-white">Datos de identificación:</strong> nombre completo, correo electrónico, número de contacto (WhatsApp).</li>
            <li><strong className="text-white">Datos empresariales:</strong> razón social, NIT, códigos UNSPSC, capacidad de contratación.</li>
            <li><strong className="text-white">Documentos corporativos:</strong> RUP, estados financieros, certificados de experiencia (solo con Plan PRO, cargados voluntariamente).</li>
            <li><strong className="text-white">Datos de navegación:</strong> dirección IP, cookies de sesión, historial de búsquedas en la plataforma.</li>
            <li><strong className="text-white">Credenciales externas:</strong> credenciales de SECOP II (módulo Publicar/Reportar, cifradas con AES-256, acceso solo para automatización autorizada).</li>
          </ul>
        </Section>

        <Section title="3. Finalidades del Tratamiento">
          <p>Los datos se tratan para las siguientes finalidades:</p>
          <ol>
            <li>Prestar el servicio de búsqueda y evaluación de licitaciones SECOP II.</li>
            <li>Personalizar los resultados de búsqueda según el perfil corporativo.</li>
            <li>Enviar alertas de licitaciones compatibles por WhatsApp y/o email.</li>
            <li>Gestionar la suscripción y el proceso de pago (Wompi Colombia).</li>
            <li>Automatizar la publicación en SECOP II y el reporte a SIA OBSERVA (módulos avanzados).</li>
            <li>Mejorar el servicio mediante análisis estadístico anonimizado.</li>
            <li>Cumplir con obligaciones legales y contractuales.</li>
          </ol>
        </Section>

        <Section title="4. Uso de Inteligencia Artificial">
          <p>Esta plataforma utiliza modelos de inteligencia artificial para:</p>
          <ul>
            <li>Analizar pliegos de condiciones de SECOP II.</li>
            <li>Comparar requisitos de licitaciones con documentos corporativos del usuario.</li>
            <li>Generar evaluaciones de factibilidad y planes de acción.</li>
            <li>Extraer campos de documentos PDF.</li>
          </ul>
          <p>Los datos enviados a los modelos de IA se procesan a través de <strong className="text-white">AWS Bedrock (Amazon Web Services)</strong>,
          ubicado en la región <strong className="text-white">us-east-1 (Norte de Virginia, EE.UU.)</strong>.
          Esta transferencia internacional se realiza bajo garantías adecuadas (Cláusulas Contractuales Tipo)
          conforme al artículo 26 de la Ley 1581/2012.</p>
          <p>La IA no toma decisiones vinculantes de manera autónoma. Todos los resultados son
          orientativos y requieren revisión humana. Ver también: <Link to="/politica-ia" className="text-emerald-400 hover:text-emerald-300">Política de Uso de IA</Link>.</p>
        </Section>

        <Section title="5. Transferencias Internacionales de Datos">
          <p>Para prestar el servicio, los datos pueden ser procesados por:</p>
          <ul>
            <li><strong className="text-white">Amazon Web Services (AWS):</strong> Almacenamiento (S3), base de datos (RDS), caché (Redis), modelos de IA (Bedrock). Región us-east-1.</li>
            <li><strong className="text-white">Wompi (Bancolombia):</strong> Procesamiento de pagos. Entidad colombiana regulada por la SFC.</li>
          </ul>
          <p>Estas transferencias cuentan con acuerdos contractuales que garantizan niveles de protección
          adecuados conforme a la normativa colombiana.</p>
        </Section>

        <Section title="6. Derechos del Titular (Habeas Data)">
          <p>Como titular de datos personales, tienes derecho a:</p>
          <ul>
            <li><strong className="text-white">Conocer</strong> los datos personales que tratamos sobre ti.</li>
            <li><strong className="text-white">Actualizar</strong> los datos que sean inexactos o incompletos.</li>
            <li><strong className="text-white">Rectificar</strong> datos incorrectos.</li>
            <li><strong className="text-white">Suprimir</strong> tus datos cuando no exista obligación legal de conservarlos.</li>
            <li><strong className="text-white">Revocar</strong> la autorización de tratamiento en cualquier momento.</li>
            <li><strong className="text-white">Presentar quejas</strong> ante la Superintendencia de Industria y Comercio (SIC).</li>
          </ul>
          <p>Para ejercer estos derechos escribe a: <strong className="text-white">{EMAIL}</strong></p>
          <p>Tiempo de respuesta: 10 días hábiles (consultas) o 15 días hábiles (reclamos).</p>
        </Section>

        <Section title="7. Conservación de los Datos">
          <ul>
            <li><strong className="text-white">Datos de cuenta:</strong> mientras la cuenta esté activa + 2 años.</li>
            <li><strong className="text-white">Documentos corporativos:</strong> mientras dure la suscripción PRO + 30 días tras cancelación.</li>
            <li><strong className="text-white">Registros de transacciones:</strong> 5 años (obligación legal tributaria).</li>
            <li><strong className="text-white">Datos de navegación/logs:</strong> 90 días.</li>
          </ul>
        </Section>

        <Section title="8. Seguridad">
          <p>Implementamos medidas técnicas y organizativas para proteger tus datos:</p>
          <ul>
            <li>Cifrado en tránsito con TLS 1.3 (HTTPS obligatorio).</li>
            <li>Cifrado en reposo en base de datos y almacenamiento S3 (AES-256).</li>
            <li>Control de acceso con autenticación JWT de corta duración.</li>
            <li>Credenciales externas (SECOP II) cifradas en AWS Secrets Manager.</li>
            <li>Auditoría de accesos en AWS CloudTrail.</li>
          </ul>
        </Section>

        <Section title="9. Registro ante la SIC">
          <p>Las bases de datos de {RESPONSIBLE} se encuentran registradas en el Registro Nacional de
          Bases de Datos (RNBD) de la Superintendencia de Industria y Comercio, según lo exigido por
          la Ley 1581 de 2012.</p>
        </Section>

        <Section title="10. Cambios a esta Política">
          <p>Nos reservamos el derecho de actualizar esta política. Te notificaremos por correo electrónico
          con al menos 10 días de anticipación ante cambios sustanciales. El uso continuado de la plataforma
          tras la notificación constituye aceptación de los cambios.</p>
        </Section>

        <div className="mt-10 pt-6 border-t border-white/5 text-stone-600 text-xs">
          <p>{RESPONSIBLE} · {EMAIL} · {SITE}</p>
          <p>Última actualización: {LAST_UPDATED}</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-semibold text-xl text-white mb-3 border-b border-white/8 pb-2">{title}</h2>
      <div className="text-stone-400 text-sm leading-relaxed space-y-3">{children}</div>
    </div>
  );
}
