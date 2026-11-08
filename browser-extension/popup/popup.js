// popup.js — Fixed: reads storage directly instead of via sendMessage
// (Manifest V3 service workers are ephemeral; sendMessage for GET_STATUS
// causes "message channel closed" errors when the worker is suspended.)
document.addEventListener('DOMContentLoaded', async () => {
  const loginView  = document.getElementById('login-view');
  const loggedView = document.getElementById('logged-view');
  const statusEl   = document.getElementById('status');
  const emailInput = document.getElementById('email');
  const passInput  = document.getElementById('password');
  const loginBtn   = document.getElementById('login-btn');
  const logoutBtn  = document.getElementById('logout-btn');
  const userEmail  = document.getElementById('user-email');

  function showStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + (isError ? 'error' : 'ok');
    statusEl.style.display = 'block';
  }

  // FIX: Read storage DIRECTLY — do NOT use sendMessage for this.
  // sendMessage requires the service worker to be alive to respond.
  // chrome.storage.local.get works even when the service worker is dormant.
  const stored = await chrome.storage.local.get(['jwt', 'jwt_expires', 'user_email']);
  if (stored?.jwt && stored?.jwt_expires > Date.now()) {
    loginView.style.display = 'none';
    loggedView.style.display = 'block';
    userEmail.textContent = stored.user_email || '';
  }

  // Login — must go through background because it needs to make a fetch() call
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passInput.value;
    if (!email || !pass) { showStatus('Completa todos los campos', true); return; }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    try {
      const result = await chrome.runtime.sendMessage({ type: 'LOGIN', email, password: pass });
      if (result?.ok) {
        loginView.style.display = 'none';
        loggedView.style.display = 'block';
        userEmail.textContent = result.email;
      } else {
        showStatus(result?.error || 'Error al iniciar sesión', true);
      }
    } catch {
      // Service worker was suspended mid-call — retry after waking it
      showStatus('Reconectando... intenta de nuevo', false);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Iniciar sesión';
    }
  });

  passInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

  // Logout — writes to storage, no async response needed
  logoutBtn.addEventListener('click', async () => {
    await chrome.storage.local.remove(['jwt', 'jwt_expires', 'user_email']);
    loggedView.style.display = 'none';
    loginView.style.display = 'block';
  });
});
