/**
 * background.js (Service Worker) — Fixed for Manifest V3 ephemeral workers.
 *
 * Key fixes:
 * - GET_STATUS removed: popup reads storage directly now
 * - All message handlers call sendResponse synchronously or in IIFE
 * - sendResponse always called even for fire-and-forget messages
 */

const API_BASE = 'https://contracts.colombiatic.com.co';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOGIN') {
    // Must use async IIFE — return true keeps channel open
    (async () => {
      try {
        const result = await handleLogin(msg.email, msg.password);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (msg.type === 'LOGOUT') {
    chrome.storage.local.remove(['jwt', 'jwt_expires', 'user_email'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'OPEN_POPUP') {
    // Fire-and-forget — always respond to avoid "message channel closed" error
    chrome.action.openPopup?.().catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  // Unknown message — respond immediately to avoid channel errors
  sendResponse({ ok: false, error: 'Unknown message type' });
  return false;
});

async function handleLogin(email, password) {
  const resp = await fetch(`${API_BASE}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'contracts' },
    body:    JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (resp.ok && data.token) {
    await chrome.storage.local.set({
      jwt:         data.token,
      jwt_expires: Date.now() + 86_400_000,
      user_email:  email,
    });
    return { ok: true, email };
  }
  return { ok: false, error: data.detail || 'Credenciales incorrectas' };
}

// Badge: show ⚡ when user is on SECOP II
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  try {
    if (tab.url?.includes('community.secop.gov.co') ||
        tab.url?.includes('www.secop.gov.co')) {
      chrome.action.setBadgeText({ text: '⚡', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {
    // Tab may have been closed — ignore
  }
});
