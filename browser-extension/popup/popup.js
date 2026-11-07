// popup.js
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

  // Check current auth status
  const stored = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
  if (stored?.jwt && stored?.jwt_expires > Date.now()) {
    loginView.style.display = 'none';
    loggedView.style.display = 'block';
    userEmail.textContent = stored.user_email || '';
  }

  // Login
  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value.trim();
    const pass  = passInput.value;
    if (!email || !pass) { showStatus('Completa todos los campos', true); return; }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    const result = await chrome.runtime.sendMessage({ type: 'LOGIN', email, password: pass });
    loginBtn.disabled = false;
    loginBtn.textContent = 'Iniciar sesión';

    if (result?.ok) {
      loginView.style.display = 'none';
      loggedView.style.display = 'block';
      userEmail.textContent = result.email;
    } else {
      showStatus(result?.error || 'Error al iniciar sesión', true);
    }
  });

  // Enter key on password field
  passInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    loggedView.style.display = 'none';
    loginView.style.display = 'block';
  });
});
