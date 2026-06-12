// JoeMail Admin - Shared JavaScript
const API = '/api/admin';
let token = localStorage.getItem('admin_token');
let serverIP = 'YOUR_SERVER_IP';

// ===== AUTH =====
function doLogin() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    fetch(API + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    .then(r => r.json())
    .then(data => {
        if (data.success && data.data && data.data.token) {
            token = data.data.token;
            localStorage.setItem('admin_token', token);
            window.location.href = '/admin/dashboard.html';
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
    setTimeout(() => el.className = 'toast', 3000);
}

// ===== HELPERS =====
function formatDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function openModal(id) { document.getElementById(id).classList.add('show'); }

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

function copyDNS(btn) {
    const val = btn.dataset.value;
    navigator.clipboard.writeText(val.replace(/\\n/g, '\n')).then(() => {
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
    const loginPass = document.getElementById('login-password');
    if (loginPass) {
        loginPass.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    }
    
    // Highlight active nav item
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '');
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        if (btn.dataset.page === currentPage) btn.classList.add('active');
    });
    
    // Fetch server IP if authenticated
    if (token && currentPage !== '') {
        fetchServerIP();
    }
});
