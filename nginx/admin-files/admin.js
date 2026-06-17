// JoeMail Admin - Shared JavaScript v2 (SPA navigation)
const API = '/api/admin';
let token = localStorage.getItem('admin_token');
let serverIP = 'YOUR_SERVER_IP';

// ===== AUTH =====
function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    if (!username || !password) { errorEl.textContent = 'Fill in all fields'; return; }
    errorEl.textContent = '';
    fetch(API + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.data && data.data.token) {
            token = data.data.token;
            localStorage.setItem('admin_token', token);
            window.location.href = '/admin/dashboard';
        } else {
            errorEl.textContent = data.message || 'Invalid credentials';
        }
    }).catch(() => { errorEl.textContent = 'Connection error'; });
}

function doLogout() {
    token = null;
    localStorage.removeItem('admin_token');
    window.location.href = '/admin/';
}

function requireAuth() {
    if (!token) {
        window.location.href = '/admin/';
        return false;
    }
    return true;
}

// ===== API =====
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
    if (res.status === 401) {
        doLogout();
        throw new Error('Session expired');
    }
    return res.json();
}

// ===== SERVER IP =====
async function fetchServerIP() {
    try {
        const data = await api('/server-info');
        if (data.success) serverIP = data.data.ip;
    } catch (e) {}
}

// ===== TOAST =====
function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.className = 'toast', 3000);
}

// ===== HELPERS =====
function formatDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function openModal(id) { document.getElementById(id).classList.add('show'); }

// ===== SIDEBAR =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    const isOpen = sidebar.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('show', isOpen);
    document.body.classList.toggle('sidebar-open', isOpen);
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
    document.body.classList.remove('sidebar-open');
}

// ===== COPY DNS =====
function copyDNS(btn) {
    const val = btn.dataset.value;
    navigator.clipboard.writeText(val.replace(/\\n/g, '\n')).then(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1500);
    }).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = val.replace(/\\n/g, '\n');
        ta.style.cssText = 'position:fixed;top:-999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.innerHTML = '<i class="fas fa-check"></i> Copied';
        setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1500);
    });
}

// ===== SPA NAVIGATION =====
const pageScripts = {
    'dashboard': '/admin/dashboard.js',
    'emails': '/admin/emails.js',
    'addresses': '/admin/addresses.js',
    'domains': '/admin/domains.js',
    'relay': '/admin/relay.js',
    'stats': '/admin/stats.js',
};
const pageTitles = {
    'dashboard': 'Dashboard',
    'emails': 'Emails',
    'addresses': 'Addresses',
    'domains': 'Domains',
    'relay': 'SMTP Relay',
    'stats': 'Statistics',
};
let currentPage = '';
let spaCache = {}; // cache fetched pages

async function navigateTo(page, pushState = true) {
    if (page === currentPage) return;
    const content = document.getElementById('content');
    if (!content) return; // on login page

    // Clear any running intervals from previous page (emails auto-refresh)
    if (typeof refreshInterval !== 'undefined' && refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }

    // Fade + slide out
    content.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
    content.style.opacity = '0';
    content.style.transform = 'translateY(8px)';
    await new Promise(r => setTimeout(r, 180));

    // Update sidebar active state
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Update header title
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) headerTitle.textContent = pageTitles[page] || page;

    // Load page content
    try {
        let html;
        if (spaCache[page]) {
            html = spaCache[page];
        } else {
            const resp = await fetch('/admin/' + page);
            if (!resp.ok) throw new Error('Page not found');
            html = await resp.text();
            spaCache[page] = html;
        }

        // Extract #content from fetched HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.getElementById('content');
        if (newContent) {
            content.innerHTML = newContent.innerHTML;
        }

        // Extract and inject modals from fetched page
        const existingModals = document.querySelectorAll('.modal-overlay');
        existingModals.forEach(m => m.remove());
        const newModals = doc.querySelectorAll('.modal-overlay');
        const toastEl = document.getElementById('toast');
        newModals.forEach(m => {
            document.body.insertBefore(m.cloneNode(true), toastEl);
        });

        // Update URL
        currentPage = page;
        if (pushState) {
            history.pushState({ page }, '', '/admin/' + page);
        }

        // Load and execute page script
        if (pageScripts[page]) {
            // Remove old page script
            const oldScript = document.getElementById('page-script');
            if (oldScript) oldScript.remove();

            const script = document.createElement('script');
            script.id = 'page-script';
            script.src = pageScripts[page] + '?v=' + Date.now();
            document.body.appendChild(script);
        }
    } catch (e) {
        content.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load page</p></div>';
    }

    // Fade + slide in
    content.style.transition = 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
    content.style.opacity = '1';
    content.style.transform = 'translateY(0)';
    
    // Stagger child animations
    requestAnimationFrame(() => {
        const cards = content.querySelectorAll('.stat-card, .system-card, .card, .dashboard-welcome');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(12px)';
            card.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            card.style.transitionDelay = (i * 50) + 'ms';
            requestAnimationFrame(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            });
        });
    });
    closeSidebar();
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
    });
    
    // Enter key on login
    const loginUser = document.getElementById('login-username');
    const loginPass = document.getElementById('login-password');
    if (loginPass) {
        loginPass.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    }
    if (loginUser) {
        loginUser.addEventListener('keypress', e => { if (e.key === 'Enter') { if (loginPass) loginPass.focus(); else doLogin(); } });
    }
    
    // SPA: intercept sidebar clicks
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(btn.dataset.page);
            closeSidebar();
        });
    });

    // SPA: handle back/forward
    window.addEventListener('popstate', e => {
        if (e.state && e.state.page) {
            navigateTo(e.state.page, false);
        }
    });

    // Determine current page from URL
    const pathParts = window.location.pathname.split('/');
    const urlPage = pathParts[pathParts.length - 1] || 'dashboard';
    if (pageScripts[urlPage]) {
        currentPage = urlPage;
        // Highlight active nav
        document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.page === urlPage);
        });
        // Update header
        const headerTitle = document.querySelector('.header-title');
        if (headerTitle) headerTitle.textContent = pageTitles[urlPage] || urlPage;
        // Script already loaded by the page itself
    }
    
    // Fetch server IP if authenticated
    if (token && urlPage !== '' && urlPage !== 'index') {
        fetchServerIP();
    }
});
