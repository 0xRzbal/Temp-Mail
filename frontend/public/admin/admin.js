// JoeMail Admin - Shared JavaScript v2
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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function openModal(id) { document.getElementById(id).classList.add('show'); }

// SPA Navigation
let currentPath = window.location.pathname;

async function loadContent(path) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) {
        console.error('Main content area not found! Falling back to full page reload.');
        window.location.href = path;
        return;
    }

    try {
        const response = await fetch(path);
        if (!response.ok) throw new Error('Failed to load page');
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newMainContent = doc.querySelector('main');
        const newScripts = doc.querySelectorAll('script:not([src^="/admin/admin.js"])'); // Exclude admin.js itself

        // Clear existing dynamic scripts to prevent re-execution issues
        mainContent.innerHTML = ''; // Clear content first
        
        if (newMainContent) {
            mainContent.innerHTML = newMainContent.innerHTML;
        } else {
            console.warn('New content does not contain a <main> element. Loading full HTML.');
            // If no <main> tag, try to find a relevant content block or load raw HTML
            const bodyContent = doc.querySelector('body > *'); // Get direct children of body
            if (bodyContent) {
                mainContent.innerHTML = bodyContent.outerHTML; // Take first relevant block
            } else {
                mainContent.innerHTML = html; // Fallback to raw HTML
            }
        }
        
        // Execute scripts from new content (ensure order for dependencies)
        const scriptsToExecute = [];
        newScripts.forEach(script => {
            if (script.src) {
                scriptsToExecute.push(new Promise(resolve => {
                    const newScript = document.createElement('script');
                    newScript.src = script.src;
                    newScript.onload = resolve;
                    newScript.onerror = () => { console.error('Error loading script:', script.src); resolve(); };
                    document.head.appendChild(newScript);
                }));
            } else {
                scriptsToExecute.push(Promise.resolve().then(() => {
                    try {
                        eval(script.textContent); // Execute inline scripts
                    } catch (e) {
                        console.error('Error executing inline script:', e);
                    }
                }));
            }
        });
        await Promise.all(scriptsToExecute); // Wait for all scripts to load/execute

        window.history.pushState({}, '', path);
        currentPath = path;

        updateActiveNavItem(path);

        // Explicitly call init function for the new page if it exists
        const pageName = path.split('/').pop().split('.')[0];
        const initFuncName = 'init' + pageName.charAt(0).toUpperCase() + pageName.slice(1);
        if (typeof window[initFuncName] === 'function') {
            window[initFuncName]();
        } else {
            console.warn(`No specific init function found for page: ${pageName}`);
        }

    } catch (error) {
        console.error('Error loading content:', error);
        window.location.href = path; // Fallback to full reload on error
    }
}

function handleNavigationClick(event) {
    const target = event.target.closest('a[href^="/admin"]');
    if (target && target.getAttribute('target') !== '_blank' && !target.hasAttribute('download')) {
        event.preventDefault();
        const href = target.getAttribute('href');
        if (href && href !== currentPath) { // Only load if different path
            loadContent(href);
            closeSidebar();
        }
    }
}

function updateActiveNavItem(path) {
    const pathParts = path.split('/');
    const currentPage = pathParts[pathParts.length - 1].replace('.html', '') || 'dashboard';
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.page === currentPage) {
            btn.classList.add('active');
        }
    });
}

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
        // Fallback for non-HTTPS
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
    
    // Event listener for SPA navigation
    document.body.addEventListener('click', handleNavigationClick);

    // Initial load for SPA
    window.addEventListener('popstate', () => loadContent(window.location.pathname));

    // Highlight active nav item (clean URL support)
    updateActiveNavItem(window.location.pathname);
    
    // Auto-close sidebar on nav click (mobile)
    document.querySelectorAll('.sidebar .nav-item[data-page], .sidebar-footer .nav-item').forEach(item => {
        item.addEventListener('click', () => { closeSidebar(); });
    });
    
    // Backdrop click closes sidebar
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeSidebar);
    }
    
    // Escape key closes sidebar
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeSidebar();
            document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        }
    });
    
    // Fetch server IP if authenticated
    if (token && currentPage !== '' && currentPage !== 'index') {
        fetchServerIP();
    }
});
