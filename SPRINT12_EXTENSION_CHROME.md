# Sprint 12: Extensión Chrome — Acceso Autenticado a SECOP II

> Resuelve el último hueco de datos: búsqueda en tiempo real y descarga
> de documentos usando la sesión activa del usuario en SECOP II, sin
> guardar credenciales en nuestro servidor.

---

## Por qué la extensión es el enfoque correcto

| Criterio | Guardar credenciales | Extensión Chrome | Session import |
|---|:---:|:---:|:---:|
| Legal (Ley 1273/2009) | ❌ Viola | ✅ Ok | ✅ Ok |
| Firma Digital requerida | ❌ No funciona | ✅ Ya autenticado | ✅ Ya autenticado |
| Credenciales en servidor | ❌ Sí | ✅ No | ✅ No |
| Tiempo real | ✅ | ✅ | ✅ (hasta expirar) |
| Requiere acción del user | ✅ Login 1 vez | ✅ Instalar 1 vez | ⚠️ Copiar cookies c/vez |
| Docs de Azure Blob | ✅ | ✅ SAS URL capture | ✅ Con cookies |
| Esfuerzo implementación | Medio | Alto (manifest V3) | Bajo |

---

## Lo que hace la extensión

### Capacidad 1: Captura de resultados de búsqueda
```
Usuario busca "inteligencia artificial" en SECOP II
    → Extensión intercepta la respuesta XHR del servidor SECOP
    → Extrae el JSON con los procesos
    → Botón: "Importar X resultados a ColombiaTIC Contracts"
    → API recibe los procesos y los guarda en external_processes
    → Usuario ve resultados EN TIEMPO REAL en nuestro sistema
```

### Capacidad 2: Captura de documentos (SAS URLs de Azure)
```
Usuario abre proceso EC-0702026 en SECOP II
    → SECOP II carga la lista de documentos (XHR a /api/documents)
    → Extensión captura los SAS URLs de Azure Blob Storage
    → "Importar documentos (2 archivos) a ColombiaTIC Contracts"
    → Nuestro backend descarga directo desde Azure (no necesita sesión)
    → Pipeline: ZIP extractor → auto-fill → evaluación IA
```

### Capacidad 3: Importar proceso con 1 clic
```
Usuario está viendo EC-0702026 en SECOP II
    → Extensión detecta la página de proceso
    → Extrae todos los campos del DOM (título, entidad, UNSPSC, deadline)
    → Botón flotante: "⚡ Analizar en ColombiaTIC"
    → Redirect a nuestro dashboard con el proceso ya cargado
```

---

## Arquitectura técnica

### Stack de la extensión
```
Manifest V3 (Chrome + Edge compatible)
├── content_script.js  — corre en todas las páginas de secop.gov.co
│   ├── Intercepta XHR/fetch responses
│   ├── Extrae datos del DOM cuando el user está en un proceso
│   └── Muestra UI flotante (botón, contador de procesos detectados)
├── background.js (Service Worker)
│   ├── Maneja la comunicación entre content_script y popup
│   └── Llama a nuestra API con el JWT del usuario
├── popup.html — mini UI en el icono de la extensión
│   ├── Login con ColombiaTIC (OAuth, mismo JWT)
│   └── Estado de sincronización
└── options.html — configuración del endpoint API
```

### Comunicación con nuestro backend
```javascript
// content_script.js (corre en secop.gov.co)
const originalFetch = window.fetch;
window.fetch = async (url, options) => {
    const response = await originalFetch(url, options);
    
    // Interceptamos respuestas de la API interna de SECOP II
    if (url.includes('/api/Tender/GetDocumentList') ||
        url.includes('/api/Tender/Search')) {
        const clone = response.clone();
        const data  = await clone.json();
        
        // Enviamos al background script
        chrome.runtime.sendMessage({
            type: 'SECOP_DATA',
            endpoint: url,
            data: data
        });
    }
    return response;
};
```

```javascript
// background.js (Service Worker)
chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === 'SECOP_DATA') {
        const jwt = await getStoredJWT();  // JWT de ColombiaTIC
        
        await fetch('https://contracts.colombiatic.com.co/api/v1/extension/ingest', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_url: msg.endpoint,
                data: msg.data,
            })
        });
    }
});
```

### Nuevo endpoint backend: `/api/v1/extension/ingest`
```python
@router.post("/api/v1/extension/ingest")
async def ingest_from_extension(
    body: ExtensionIngestRequest,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Receives SECOP II API responses captured by the Chrome extension.
    Stores as external_processes or process_documents depending on type.
    """
    if 'Tender/Search' in body.source_url:
        # Bulk process import from search results
        return await _ingest_search_results(body.data, user_id, settings)
    
    elif 'GetDocumentList' in body.source_url:
        # Document SAS URLs — download them directly
        return await _ingest_document_sas_urls(body.data, user_id, settings)
    
    elif 'GetProcessDetail' in body.source_url:
        # Single process details
        return await _ingest_process_detail(body.data, user_id, settings)
```

---

## Sprint plan

### Phase 1 (2 semanas): Extensión MVP
| ID | Task | Habilitador |
|----|------|-------------|
| S12-E1 | Chrome extension boilerplate (Manifest V3, content_script, background, popup) | Node.js, webpack o vite para el bundle |
| S12-E2 | XHR interceptor para `community.secop.gov.co` — captura responses de `/api/Tender/*` | content_script.js |
| S12-E3 | Botón flotante en páginas de proceso SECOP II con UI minimal | CSS isolation (Shadow DOM para no romper estilos SECOP) |
| S12-E4 | Auth: login con ColombiaTIC en popup → guarda JWT en chrome.storage.local | OAuth or email/password |
| S12-E5 | Background service worker → envía datos a `/api/v1/extension/ingest` | JWT en chrome.storage |
| S12-E6 | Backend: `POST /api/v1/extension/ingest` → procesa resultados de búsqueda | `external_router.py` |
| S12-E7 | Backend: descarga SAS URLs de Azure Blob directamente (sin sesión!) | httpx, S3 upload |
| S12-E8 | Publish a Chrome Web Store (developer account $5 USD) | Google developer account |

### Phase 2 (1 semana): Session Import sin extensión
| ID | Task | Habilitador |
|----|------|-------------|
| S12-S1 | UI en settings: "Importar sesión SECOP II" → textarea para pegar cookies | Frontend |
| S12-S2 | Backend: `POST /api/v1/secop/session` → guarda cookies cifradas en Secrets Manager (TTL 2h) | boto3 Secrets Manager |
| S12-S3 | Wrapper httpx: si hay sesión activa, adjunta cookies a requests de SECOP II | `secop_soda_gateway.py` |
| S12-S4 | Worker que invalida sesiones expiradas | background task |

---

## Diferenciador vs Farolic

Farolic tiene MCP (para asistentes de texto). Lo que proponemos va más lejos:
- **Farolic**: consultas de texto → respuestas de texto
- **Nosotros**: extensión Chrome → captura tiempo real → procesamiento completo con IA → documentos generados

Es el único producto en el mercado colombiano que puede hacer esto.

---

## Resumen de la decisión

**Para implementar YA (sin extensión):**
→ Sprint 10B (proceso externo con paste) — ya desplegado ✅

**Para implementar en Sprint 12:**
→ Extensión Chrome — acceso tiempo real, SAS URL capture, 1-click import

**Lo que NUNCA haremos:**
→ Guardar credenciales/certificados de SECOP II en nuestro servidor
