// ── GLOBAL TOAST ───────────────────────────────────────────────
function showToast(message, type = 'info') {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transition = 'opacity .4s';
    setTimeout(() => t.remove(), 400);
  }, 3500);
}

// ── LOGOUT ─────────────────────────────────────────────────────
function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('aquaUser');
    window.location.href = 'login.html';
  }
}

// ── DOM READY ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  // 1. Active nav highlight
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(link => {
    if (link.getAttribute('href') === page && link.id !== 'loginNavBtn') {
      link.classList.add('active');
    }
  });

  // 2. Update nav based on logged-in user
  const user = JSON.parse(localStorage.getItem('aquaUser') || 'null');
  if (user) {
    const loginLink = document.querySelector('nav a[href="login.html"]');
    if (loginLink) {
      loginLink.textContent = '👤 ' + (user.name || 'Account');
      loginLink.removeAttribute('href');
      loginLink.style.cursor = 'pointer';
      loginLink.title = 'Click to logout';
      loginLink.onclick = (e) => { e.preventDefault(); logout(); };
    }

    const dashLink = document.getElementById('dashLink');
    if (dashLink && (user.role === 'staff' || user.role === 'admin')) {
      dashLink.style.display = 'flex';
    }

    const adminLink = document.getElementById('adminLink');
    if (adminLink && user.role === 'admin') {
      adminLink.style.display = 'flex';
    }
  }

  // 3. Hamburger menu toggle
  const toggle = document.querySelector('.menu-toggle');
  const nav    = document.querySelector('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      toggle.classList.toggle('open');
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      toggle.classList.remove('open');
      nav.classList.remove('open');
    }));
  }
});

// ── ROUTE GUARD (call on staff/admin-only pages) ────────────────
// Usage: requireRole(['staff','admin']) → redirects + shows access-denied if not allowed
function requireRole(allowedRoles) {
  const user = JSON.parse(localStorage.getItem('aquaUser') || 'null');
  if (!user || !allowedRoles.includes(user.role)) {
    document.body.innerHTML = `
      <div class="page-wrap">
        <div class="access-denied">
          <h2>🚫 Access Denied</h2>
          <p>You don't have permission to view this page.</p>
          <a href="index.html" class="btn btn-blue">← Back to Home</a>
        </div>
      </div>`;
    return null;
  }
  return user;
}
