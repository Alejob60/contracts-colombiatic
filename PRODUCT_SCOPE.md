# Scope del Producto — ColombiaTIC Contracts

**Versión**: 1.0.0 · **Fecha**: 2026-11-04 · **Estado**: Aprobado

---

## Posicionamiento

**ColombiaTIC Contracts** es la plataforma de gestión integral del ciclo de contratación
pública colombiana, potenciada por IA. Cubre las 5 fases del ciclo:
**Encontrar → Evaluar → Ganar → Ejecutar → Reportar**.

### Diferenciación vs Expedito

| Dimensión | Expedito | ColombiaTIC Contracts |
|---|---|---|
| Foco | Contratistas con contratos activos (ejecución) | Ciclo completo (búsqueda hasta reporte) |
| Etapa del ciclo | Ejecutar + Reportar | Todas las etapas |
| IA | Extracción de PDF | Evaluación, RAG, match score, extracción PDF |
| Estado | Lista de espera | **Live — búsqueda activa Sprint 1** |
| Precio | Por definir | $149.000/mes o $1.431.600/año |
| Audiencia | Contratistas OPS/interventores | Contratistas + empresas licitantes |

**Nuestra ventaja**: somos el único producto que cubre búsqueda inteligente de
oportunidades NUEVAS + gestión de contratos existentes en una sola plataforma.

---

## Los 6 Módulos del Producto

### Módulo 1 — BUSCAR 🔍
*Estado: ✅ Sprint 1 completado*

Búsqueda inteligente en 5M+ procesos de SECOP II con filtros avanzados.

**Funcionalidades:**
- Búsqueda por texto libre, departamento, modalidad, tipo de contrato, rango de presupuesto
- 3 búsquedas gratuitas/día sin registro (freemium)
- Caché Redis para respuestas instantáneas
- Resultados completos solo para PRO (URLs directas SECOP II, descripción, presupuesto)

**Audiencia:** Empresas y contratistas buscando nuevas oportunidades.

---

### Módulo 2 — EVALUAR 🤖
*Estado: 🔲 Sprint 5*

Agente IA que analiza el pliego de condiciones y determina si tu empresa puede
ganar la licitación.

**Funcionalidades:**
- Match Score 0–100% entre proceso y perfil de la empresa
- Checklist de habilitación automático (experiencia, capacidad financiera, certificaciones)
- Matriz de riesgos con severidad (Alta/Media/Baja)
- Plan de acción paso a paso para subsanar faltantes
- Estado de viabilidad: "Apto para licitar" / "Apto con observaciones" / "No apto"

**Tecnología:** Claude Haiku (AWS Bedrock) + pgvector RAG + Titan Embed v2.

---

### Módulo 3 — PREPARAR 📁
*Estado: 🔲 Sprints 3–4*

Gestión del perfil corporativo y base de documentos para alimentar el evaluador IA.

**Funcionalidades:**
- Perfil de empresa: NIT, razón social, códigos UNSPSC, capacidad K de contratación
- Carga de documentos: RUP, estados financieros, certificados de experiencia, pólizas
- Indexación automática con embeddings Titan v2 (pgvector)
- Estado de "Visto Bueno" corporativo
- Guardar procesos favoritos con alertas personalizadas

---

### Módulo 4 — ALERTAS 🔔
*Estado: 🔲 Sprint 6*

Notificaciones automáticas cuando aparecen licitaciones compatibles con el perfil.

**Funcionalidades:**
- Alerta por WhatsApp y/o email cuando match score > umbral configurable (default 80%)
- Filtros por UNSPSC, departamento, modalidad, rango de presupuesto
- Frecuencia: en tiempo real, diaria o semanal
- Historial de alertas enviadas

---

### Módulo 5 — REPORTAR 📊
*Estado: 🔲 Post-Sprint 6 (Q1 2027)*
*Inspirado en Expedito — diferenciador vs competencia*

Automatización del reporte mensual SECOP II → SIA OBSERVA para contratistas
con contratos activos.

**Funcionalidades:**
- Conexión con credenciales SECOP II del contratista (cifradas en AWS Secrets Manager)
- Lectura automática de contratos activos desde SECOP II
- Prellenado de campos obligatorios en SIA OBSERVA
- Alerta de discrepancias antes de cerrar el reporte
- Compatible con OPS, interventores y multi-contrato
- Soporte para SIA Contralorías y SIRECI

**Diferenciador clave:** Expedito solo tiene waitlist. Nosotros lo lanzamos como módulo
adicional del Plan PRO una vez completado el ciclo de búsqueda.

---

### Módulo 6 — PUBLICAR 📤
*Estado: 🔲 Post-Sprint 6 (Q1 2027)*
*Inspirado en Expedito — diferenciador vs competencia*

Publicación automatizada de cuentas de cobro y documentos en SECOP II.

**Funcionalidades:**
- Sube el PDF de tu cuenta de cobro o contrato
- Extracción de campos con IA (Claude Haiku)
- Validación de campos obligatorios antes de publicar
- Publicación en SECOP II en un clic con revisión previa
- Compatible con cuentas de cobro, contratos OPS, actas
- Registro de auditoría de cada publicación

---

## Herramienta Gratuita — Generador de Cuenta de Cobro
*Estado: 🔲 Sprint 7 (SEO lead magnet)*

Generador online gratuito de cuentas de cobro en PDF, sin registro.
Objetivo: captura de tráfico orgánico (50K+ búsquedas/mes en Colombia).

**URL:** `/herramientas/cuenta-de-cobro`

Competidor directo: expedito.com.co/cuenta-de-cobro/generador/

---

## Estrategia SEO

### Keywords primarias (Colombia)
| Keyword | Volumen estimado | Intención |
|---|---|---|
| SECOP II | 90.000/mes | Informacional + Transaccional |
| licitaciones Colombia | 40.000/mes | Transaccional |
| SIA OBSERVA | 30.000/mes | Informacional |
| cuenta de cobro | 60.000/mes | Herramienta |
| contratos estatales Colombia | 20.000/mes | Informacional |
| licitaciones públicas Colombia | 15.000/mes | Transaccional |
| cómo registrarse SECOP II | 8.000/mes | Informacional |

### Páginas de contenido (orgánico)
```
/guias/secop-ii
/guias/sia-observa
/guias/cuenta-de-cobro
/guias/licitaciones-colombia
/guias/contrato-prestacion-servicios
/herramientas/cuenta-de-cobro   ← generador FREE
```

---

## Monetización

| Tier | Precio | Acceso |
|---|---|---|
| **Freemium** | Gratis | 3 búsquedas/día, resultados parciales, generador cuenta de cobro |
| **PRO Licitador** | $149.000/mes | Módulos 1-6 completos |
| **PRO Anual** | $1.431.600/año (−20%) | Mismo PRO |

*Sin plan Enterprise por ahora. Un solo plan limpio.*

---

## Marco Legal Obligatorio

| Documento | Norma | URL | Estado |
|---|---|---|---|
| Política de Privacidad y Habeas Data | Ley 1581/2012, Decreto 1377/2013 | `/privacidad` | ✅ Live |
| Términos y Condiciones | Ley 527/1999, Ley 1480/2011 | `/terminos` | ✅ Live |
| Política de Cookies | Circular SIC 02/2015 | `/cookies` | ✅ Live |
| Política de Uso de IA | Buenas prácticas + transparencia | `/politica-ia` | ✅ Live |
| Cookie Consent Banner | Ley 1581/2012, Circular SIC | Popup en primera visita | ✅ Live |

### Cookie Consent — comportamiento implementado

- **Primera visita**: el sitio carga con `blur(4px)` y un modal centrado con:
  - Descripción de cookies esenciales vs analíticas
  - Botón "Solo esenciales" (sin Analytics)
  - Botón "Aceptar todas" (con Analytics)
  - Links a `/privacidad` y `/cookies`
- **Decisión guardada en**: `localStorage.contracts_cookie_consent` (key + version)
- **Versión**: bump `CONSENT_VERSION` en `CookieConsentBanner.tsx` para re-solicitar
  consentimiento cuando cambien las políticas
- **Sin consentimiento**: el contenido existe pero está bloqueado (pointer-events-none
  + blur) — el usuario no puede interactuar hasta decidir

**Entidad responsable de datos:** ColombiaTIC SAS · dairagarzon@colombiatic.com.co
