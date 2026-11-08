/**
 * content.js — ColombiaTIC Contracts Extension
 * Runs on all community.secop.gov.co pages.
 *
 * Detects process pages and shows a floating import button.
 * ALL SECOP II data access happens from the user's browser — never
 * from our server IP. This is the key legal/technical decision.
 */

const API_BASE = 'https://contracts.colombiatic.com.co';

// ── Detect what kind of SECOP II page we're on ─────────────────────────────

function detectPageType() {
  const url = window.location.href;
  if (url.includes('/ContractNoticePhases/View') || url.includes('/OpportunityDetail/')) {
    return 'PROCESS_DETAIL';
  }
  if (url.includes('/Tendering/Search') || url.includes('/Public/Tendering/Search')) {
    return 'SEARCH_RESULTS';
  }
  return 'OTHER';
}

// ── Extract data from current process page ─────────────────────────────────

function extractProcessPageData() {
  const data = {
    page_url:   window.location.href,
    page_title: document.title,
    page_text:  document.body.innerText.substring(0, 8000),
    download_links: [],
    process_data: {},
  };

  // Extract structured data from DOM
  const cells = document.querySelectorAll('td, th, label, span, div');
  const labels = {};
  cells.forEach(el => {
    const text = el.textContent.trim();
    if (text.length > 2 && text.length < 200) {
      const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (next) labels[text.toLowerCase()] = next.textContent.trim();
    }
  });

  // Map known SECOP II labels to our fields
  const fieldMap = {
    'número del proceso':  'proceso_numero',
    'titulo':              'titulo',
    'título':              'titulo',
    'estado':              'estado',
    'entidad estatal':     'entidad',
    'unidad de contratación': 'unidad',
  };

  for (const [label, field] of Object.entries(fieldMap)) {
    for (const [k, v] of Object.entries(labels)) {
      if (k.includes(label) && v) {
        data.process_data[field] = v;
        break;
      }
    }
  }

  // Extract PPI from URL
  const ppiMatch = window.location.search.match(/PPI=([^&]+)/i);
  if (ppiMatch) data.process_data.ppi = ppiMatch[1];

  // Extract page title as process name
  if (!data.process_data.titulo && document.title) {
    data.process_data.titulo = document.title.replace(' - SECOP II', '').trim();
  }

  // Capture download links (Azure Blob SAS URLs + direct file links)
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href || '';
    const text = (a.textContent || '').trim();
    if (href.match(/blob\.core\.windows\.net|\.(pdf|xlsx|xls|zip|docx)(\?|$)/i)
        && href.length < 2000) {
      data.download_links.push({
        url:      href,
        text:     text,
        filename: href.split('/').pop().split('?')[0],
      });
    }
  });

  return data;
}

// ── Floating action button ─────────────────────────────────────────────────

let buttonEl = null;

function createButton(label, onClick) {
  if (buttonEl) buttonEl.remove();

  buttonEl = document.createElement('div');
  buttonEl.id = 'colombiatic-import-btn';
  buttonEl.innerHTML = `
    <div style="
      position:fixed;bottom:24px;right:24px;z-index:2147483647;
      background:linear-gradient(135deg,#10b981,#0d9488);
      color:#fff;padding:12px 18px;border-radius:12px;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;font-weight:600;
      cursor:pointer;box-shadow:0 4px 24px rgba(0,0,0,.3);
      display:flex;align-items:center;gap:8px;
      transition:opacity .2s;user-select:none;
    " id="colombiatic-btn-inner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
      ${label}
    </div>
  `;
  buttonEl.querySelector('#colombiatic-btn-inner').addEventListener('click', onClick);
  document.body.appendChild(buttonEl);
}

function showStatus(message, isError = false) {
  if (buttonEl) {
    const inner = buttonEl.querySelector('#colombiatic-btn-inner');
    if (inner) {
      inner.style.background = isError ? '#ef4444' : '#10b981';
      inner.innerHTML = `<span>${message}</span>`;
    }
  }
}

// ── Handle import action ────────────────────────────────────────────────────

async function handleImport() {
  // Get stored JWT
  const stored = await chrome.storage.local.get(['jwt', 'jwt_expires']);
  if (!stored.jwt) {
    // FIX: wrap sendMessage in try-catch — service worker may be dormant
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
    } catch { /* ignore if service worker not available */ }
    showStatus('⚙️ Inicia sesión primero', false);
    setTimeout(() => buttonEl?.remove(), 3000);
    return;
  }

  const data = extractProcessPageData();
  showStatus('⏳ Importando...');

  try {
    const resp = await fetch(`${API_BASE}/api/v1/browser/ingest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${stored.jwt}` },
      body:    JSON.stringify({ source: 'extension', ...data }),
    });
    const result = await resp.json();

    if (resp.ok) {
      showStatus(`✅ ${result.message || 'Importado'}`);
      setTimeout(() => {
        if (result.workspace_url) {
          window.open(`${API_BASE}${result.workspace_url}`, '_blank');
        }
        buttonEl?.remove();
      }, 2000);
    } else {
      showStatus(`❌ ${result.detail || 'Error'}`, true);
      setTimeout(() => buttonEl?.remove(), 3000);
    }
  } catch (err) {
    showStatus(`❌ ${err.message}`, true);
    setTimeout(() => buttonEl?.remove(), 3000);
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

function init() {
  const pageType = detectPageType();

  if (pageType === 'PROCESS_DETAIL') {
    // Slight delay to let Angular finish rendering
    setTimeout(() => {
      createButton('⚡ Importar a ColombiaTIC', handleImport);
    }, 1500);
  }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Also handle Angular SPA navigation (URL changes without full reload)
let lastUrl = location.href;
new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    buttonEl?.remove();
    setTimeout(init, 1000);
  }
}).observe(document, { subtree: true, childList: true });
