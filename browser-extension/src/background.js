/**
 * background.js (Service Worker) — ColombiaTIC Contracts Extension
 * Handles auth and cross-tab communication.
 */

const API_BASE = 'https://contracts.colombiatic.com.co';

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'LOGIN') {
    handleLogin(msg.email, msg.password).then(sendResponse);
    return true; // Keep channel open for async response
  }
  if (msg.type === 'LOGOUT') {
    chrome.storage.local.remove(['jwt', 'jwt_expires', 'user_email']);
    sendResponse({ ok: true });
  }
  if (msg.type === 'GET_STATUS') {
    chrome.storage.local.get(['jwt', 'jwt_expires', 'user_email']).then(sendResponse);
    return true;
  }
  if (msg.type === 'OPEN_POPUP') {
    chrome.action.openPopup?.();
  }
});

async function handleLogin(email, password) {
  try {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': 'contracts' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (resp.ok && data.token) {
      const expires = Date.now() + 86_400_000; // 24h
      await chrome.storage.local.set({
        jwt:          data.token,
        jwt_expires:  expires,
        user_email:   email,
      });
      return { ok: true, email };
    }
    return { ok: false, error: data.detail || 'Credenciales incorrectas' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Show badge when on SECOP II
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('community.secop.gov.co')) {
    chrome.action.setBadgeText({ text: '⚡', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId });
  } else if (changeInfo.status === 'complete') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
