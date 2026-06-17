// JoeMail Frontend - Premiumisme.info clone (v2 API + Socket.IO)
const API_BASE = '/api';
const WS_ENABLED = typeof io !== 'undefined';
let currentEmail = null;
let currentInbox = [];
let pollInterval = null;
let availableDomains = [];
let selectedDomain = null;
let socket = null;
const EMAIL_HISTORY_KEY = 'joemail_history';

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initCookieBanner();
    loadDomains().then(() => {
        loadExistingEmail();
    });
    bindEvents();
    initSocketIO();
});

// ============================================================
// SOCKET.IO (real-time email notifications)
// ============================================================
function initSocketIO() {
    try {
        socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 2000 });
        socket.on('connect', () => console.log('[WS] Connected'));
        socket.on('disconnect', () => console.log('[WS] Disconnected'));
        socket.on('new_email', (data) => {
            if (currentEmail && data) {
                fetchInbox();
            }
        });
        socket.on('email_deleted', () => { if (currentEmail) fetchInbox(); });
        socket.on('inbox_cleared', () => { if (currentEmail) fetchInbox(); });
    } catch (e) {
        console.log('[WS] Socket.IO not available, using polling only');
    }
}

function wsSubscribe(email) {
    if (socket && socket.connected) {
        socket.emit('subscribe', email.toLowerCase().trim());
    }
}

function wsUnsubscribe(email) {
    if (socket && socket.connected) {
        socket.emit('unsubscribe', email.toLowerCase().trim());
    }
}

// ============================================================
// COOKIE BANNER
// ============================================================
function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    const closeBtn = document.getElementById('cookie-close');

    if (!banner) return;

    if (localStorage.getItem('cookies_accepted') === 'yes') {
        banner.classList.add('hidden');
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            banner.classList.add('hidden');
            localStorage.setItem('cookies_accepted', 'yes');
        });
    }
}

// ============================================================
// API HELPERS
// ============================================================
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers: { ...headers, ...opts.headers } });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.message || err.error || 'API error');
    }
    return res.json();
}

// Unwrap v2 API response: { success, data, message }
function unwrap(res) {
    if (res && res.success && res.data) return res.data;
    if (res && res.data) return res.data;
    return res;
}

function toast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.backgroundColor = type === 'error' ? '#dc2626' : '#16a34a';
    el.classList.remove('translate-y-20', 'opacity-0');
    el.classList.add('translate-y-0', 'opacity-100');
    setTimeout(() => {
        el.classList.remove('translate-y-0', 'opacity-100');
        el.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// ============================================================
// SMOOTH ANIMATION HELPERS
// ============================================================
function animShow(el, type) {
    if (!el) return;
    el.style.display = '';
    el.classList.remove('hidden');
    void el.offsetHeight;
    el.classList.add('open');
}

function animHide(el, type) {
    if (!el) return;
    el.classList.remove('open');
    const dur = type === 'overlay' ? 300 : type === 'dropdown' ? 200 : 250;
    setTimeout(() => {
        el.classList.add('hidden');
        el.style.display = '';
    }, dur);
}

function animToggle(el, type) {
    if (!el) return;
    if (el.classList.contains('open')) {
        animHide(el, type);
    } else {
        animShow(el, type);
    }
}

// ============================================================
// DOMAINS
// ============================================================
async function loadDomains() {
    try {
        const res = await api('/domain/list');
        const data = unwrap(res);
        availableDomains = (data.domains || []).map(d => ({ name: d.domain || d.name, active: d.active }));
        if (availableDomains.length > 0) {
            selectedDomain = availableDomains[0].name;
        }
        renderDomainDropdown();
    } catch (e) {
        console.error('Failed to load domains:', e);
        availableDomains = [];
    }
}

function renderDomainDropdown() {
    const list = document.getElementById('domain-dropdown-list');
    const display = document.getElementById('domain-display');

    if (!list || !display) return;
    list.innerHTML = '';

    if (availableDomains.length === 0) {
        display.placeholder = 'No domains available';
        return;
    }

    availableDomains.forEach(domain => {
        const a = document.createElement('a');
        a.className = 'dropdown-item' + (domain.name === selectedDomain ? ' active' : '');
        a.textContent = domain.name;
        a.addEventListener('click', () => {
            selectedDomain = domain.name;
            display.value = domain.name;
            renderDomainDropdown();
            closeDomainDropdown();
        });
        list.appendChild(a);
    });

    if (selectedDomain) {
        display.value = selectedDomain;
    } else if (availableDomains.length > 0) {
        selectedDomain = availableDomains[0].name;
        display.value = selectedDomain;
    }
}

function openDomainDropdown() {
    animShow(document.getElementById('domain-dropdown-menu'), 'dropdown');
}

function closeDomainDropdown() {
    animHide(document.getElementById('domain-dropdown-menu'), 'dropdown');
}


function getEmailHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(EMAIL_HISTORY_KEY) || '[]');
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function saveEmailToHistory(email) {
    if (!email) return;
    const history = getEmailHistory().filter(item => item !== email);
    history.unshift(email);
    localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
    renderEmailHistoryDropdown();
}

function removeEmailFromHistory(email) {
    if (!email) return;
    const history = getEmailHistory().filter(item => item !== email);
    localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history));
    renderEmailHistoryDropdown();
}

// Auto-delete oldest emails from backend, keeping only currentEmail
async function pruneOldEmails(currentNew) {
    const history = getEmailHistory();
    const oldOnes = history.filter(e => e !== currentNew);
    if (oldOnes.length === 0) return;

    // Remove oldest from dropdown history only (don't delete from backend)
    const toRemove = oldOnes[oldOnes.length - 1];
    removeEmailFromHistory(toRemove);
}

function renderEmailHistoryDropdown() {
    const list = document.getElementById('email-dropdown-list');
    if (!list) return;
    const history = getEmailHistory();
    list.innerHTML = '';

    if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'dropdown-item';
        empty.style.opacity = '0.5';
        empty.textContent = 'No previous emails';
        list.appendChild(empty);
        return;
    }

    history.forEach(email => {
        const a = document.createElement('a');
        a.className = 'dropdown-item' + (email === currentEmail ? ' active' : '');
        a.textContent = email;
        a.addEventListener('click', () => selectEmailFromHistory(email));
        list.appendChild(a);
    });
}

async function selectEmailFromHistory(email, scroll = true) {
    // Verify email still exists on backend
    try {
        const check = await api('/email/check/' + encodeURIComponent(email));
        if (!check.success || !check.data || !check.data.exists) {
            toast('Email no longer exists, generating new one', 'error');
            removeEmailFromHistory(email);
            renderEmailHistoryDropdown();
            createRandomEmail();
            return;
        }
    } catch (e) {}
    if (currentEmail) wsUnsubscribe(currentEmail);
    currentEmail = email;
    localStorage.setItem('joemail_address', email);
    document.getElementById('email-display').textContent = email;
    animHide(document.getElementById('email-dropdown-menu'), 'dropdown');
    saveEmailToHistory(email);
    wsSubscribe(email);
    stopPolling();
    fetchInbox();
    startPolling();
    if (scroll) {
        document.getElementById('inbox-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================================
// EMAIL MANAGEMENT
// ============================================================
async function loadExistingEmail() {
    renderEmailHistoryDropdown();
    const saved = localStorage.getItem('joemail_address');
    if (saved) {
        // Verify email still exists on backend (may have been deleted from admin panel)
        try {
            const check = await api('/email/check/' + encodeURIComponent(saved));
            if (!check.success || !check.data || !check.data.exists) {
                // Email deleted from backend, auto-generate new
                localStorage.removeItem('joemail_address');
                removeEmailFromHistory(saved);
                createRandomEmail();
                return;
            }
        } catch (e) {
            // Check failed, try to use saved email anyway
        }
        currentEmail = saved;
        document.getElementById('email-display').textContent = saved;
        saveEmailToHistory(saved);
        wsSubscribe(saved);
        startPolling();
    } else {
        createRandomEmail();
    }
}

async function createRandomEmail(prefix = null) {
    try {
        const body = {};
        if (prefix) body.prefix = prefix;
        if (selectedDomain) body.domain = selectedDomain;

        const res = await api('/email/create', {
            method: 'POST',
            body: JSON.stringify(body)
        });
        const data = unwrap(res);

        const oldEmail = currentEmail;
        if (currentEmail) wsUnsubscribe(currentEmail);
        currentEmail = data.email;
        localStorage.setItem('joemail_address', data.email);
        saveEmailToHistory(data.email);
        wsSubscribe(data.email);

        document.getElementById('email-display').textContent = data.email;
        showEmailView();
        startPolling();


    } catch (e) {
        if (prefix && e.message && e.message.includes('already taken')) {
            const domain = selectedDomain || 'rzbal.biz.id';
            const email = prefix.includes('@') ? prefix : prefix + '@' + domain;
            try {
                const checkRes = await api('/email/check/' + encodeURIComponent(email));
                const checkData = unwrap(checkRes);
                if (checkData.exists) {
                    if (currentEmail) wsUnsubscribe(currentEmail);
                    currentEmail = email;
                    localStorage.setItem('joemail_address', email);
                    saveEmailToHistory(email);
                    wsSubscribe(email);
                    document.getElementById('email-display').textContent = email;
                    showEmailView();
                    startPolling();
                    toast('Email loaded');
                    return;
                }
            } catch (checkErr) {
                console.error('Check email failed:', checkErr);
            }
        }
        console.error('Create email failed:', e);
        document.getElementById('email-display').textContent = 'Error - click New';
        toast('Failed to create email: ' + e.message, 'error');
    }
}

async function createCustomEmail() {
    const username = document.getElementById('new-username').value.trim();
    if (!username) return toast('Enter a username', 'error');
    const domain = selectedDomain || 'rzbal.biz.id';
    const email = username + '@' + domain;
    try {
        const checkRes = await api('/email/check/' + encodeURIComponent(email));
        const checkData = unwrap(checkRes);
        if (checkData.exists) {
            if (currentEmail) wsUnsubscribe(currentEmail);
            currentEmail = email;
            localStorage.setItem('joemail_address', email);
            saveEmailToHistory(email);
            wsSubscribe(email);
            document.getElementById('email-display').textContent = email;
            showEmailView();
            startPolling();
            toast('Email loaded');
            return;
        }
    } catch (e) {}
    await createRandomEmail(username);
}

// deleteEmail moved to detail view

function instantViewSwap(showEl, hideEl) {
    if (!showEl || !hideEl) return;
    hideEl.classList.remove('open');
    hideEl.style.pointerEvents = '';
    setTimeout(() => {
        hideEl.classList.add('hidden');
        hideEl.style.display = '';
        showEl.classList.remove('hidden');
        showEl.style.display = '';
        showEl.style.pointerEvents = '';
        void showEl.offsetHeight;
        showEl.classList.add('open');
    }, 200);
}

function showEmailView() {
    instantViewSwap(document.getElementById('email-view'), document.getElementById('new-email-view'));
}

function showNewEmailView() {
    instantViewSwap(document.getElementById('new-email-view'), document.getElementById('email-view'));
}

// ============================================================
// INBOX POLLING
// ============================================================
function startPolling() {
    stopPolling();
    fetchInbox();
    pollInterval = setInterval(fetchInbox, 5000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

async function fetchInbox() {
    if (!currentEmail) return;

    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) refreshIcon.classList.remove('pause-spinner');

    try {
        const res = await api(`/email/inbox/${encodeURIComponent(currentEmail)}`);
        const data = unwrap(res);
        currentInbox = data.emails || [];
        renderInbox();
    } catch (e) {
        console.error('Fetch inbox failed:', e);
        if (e.message.includes('not found') || e.message.includes('expired')) {
            localStorage.removeItem('joemail_address');
            currentEmail = null;
            stopPolling();
            document.getElementById('email-display').textContent = 'Expired - click New';
        }
    }

    setTimeout(() => {
        if (refreshIcon) refreshIcon.classList.add('pause-spinner');
    }, 500);
}

function renderInbox() {
    const list = document.getElementById('inbox-list');
    const empty = document.getElementById('inbox-empty');

    if (currentInbox.length === 0) {
        list.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    list.classList.remove('hidden');
    list.innerHTML = '';

    currentInbox.forEach((msg, idx) => {
        const item = document.createElement('div');
        item.className = 'inbox-item inbox-fade-in' + (idx === selectedIdx ? ' inbox-item-selected' : '');
        item.style.animationDelay = `${idx * 0.05}s`;
        item.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex-1 min-w-0" style="pointer-events:none">
                    <div class="from">${escapeHtml(msg.from || msg.fromAddress || 'Unknown')}</div>
                    <div class="subject truncate">${escapeHtml(msg.subject || '(no subject)')}</div>
                </div>
                <div class="flex items-center gap-2 ml-3 whitespace-nowrap" style="pointer-events:none">
                    <div class="date">${formatDate(msg.date || msg.createdAt)}</div>
                </div>
            </div>
        `;
        // Tap the main area to open detail
        item.addEventListener('click', (e) => {
            if (e.target.closest('.inbox-delete-btn')) return;
            selectedIdx = idx;
            currentMessage = msg;
            showMessage(msg, idx);
        });
        list.appendChild(item);
    });
}

let currentMessage = null;
let selectedIdx = -1;

async function showMessage(msg, idx) {
    if (msg.id) {
        try {
            const res = await api(`/email/message/${msg.id}`);
            const detail = unwrap(res);
            msg = detail;
        } catch (e) {
            console.error('Failed to fetch message detail:', e);
        }
    }
    currentMessage = msg;

    const inboxEl = document.getElementById('inbox-section');
    const detailEl = document.getElementById('email-detail');

    // Instant swap: hide inbox, show detail (no crossfade)
    inboxEl.classList.remove('open');
    inboxEl.classList.add('hidden');
    detailEl.classList.remove('hidden');
    void detailEl.offsetHeight;
    detailEl.classList.add('open');

    document.getElementById('detail-from').textContent = msg.from || msg.fromAddress || 'Unknown';
    document.getElementById('detail-subject').textContent = msg.subject || '(no subject)';
    document.getElementById('detail-date').textContent = formatDate(msg.date || msg.createdAt);

    const bodyEl = document.getElementById('detail-body');
    const body = msg.bodyHtml || msg.html || msg.bodyText || msg.body || msg.text || msg.content || '';
    if (msg.bodyHtml || msg.html || (body.includes('<') && body.includes('>') && body.includes('/'))) {
        bodyEl.innerHTML = body;
    } else {
        bodyEl.textContent = body;
    }
}

// ============================================================
// EVENT BINDINGS
// ============================================================
function bindTap(el, handler) {
    if (!el) return;
    let touchedAt = 0;
    el.addEventListener('touchend', (e) => {
        touchedAt = Date.now();
        e.preventDefault();
        handler(e);
    }, { passive: false });
    el.addEventListener('click', (e) => {
        if (Date.now() - touchedAt < 500) return;
        handler(e);
    });
}

function bindEvents() {
    // Refresh
    bindTap(document.getElementById('btn-refresh'), () => {
        const refreshIcon = document.getElementById('refresh-icon');
        if (refreshIcon) refreshIcon.classList.remove('pause-spinner');
        fetchInbox();
    });

    // New
    bindTap(document.getElementById('btn-new'), () => {
        showNewEmailView();
    });

    // Cancel
    bindTap(document.getElementById('btn-cancel'), () => {
        showEmailView();
    });

    // Delete
    // btn-delete moved to detail view

    // Create email
    bindTap(document.getElementById('btn-create-email'), createCustomEmail);

    // Random email
    bindTap(document.getElementById('btn-random'), () => {
        createRandomEmail();
    });

    // Copy button
    bindTap(document.getElementById('btn-copy'), () => {
        if (!currentEmail) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentEmail;
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);

        if (/ipad|iphone/i.test(navigator.userAgent)) {
            const editable = input.contentEditable;
            const readOnly = input.readOnly;
            input.contentEditable = true;
            input.readOnly = false;
            const range = document.createRange();
            range.selectNodeContents(input);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            input.setSelectionRange(0, 999999);
            input.contentEditable = editable;
            input.readOnly = readOnly;
        } else {
            input.select();
        }

        document.execCommand('copy');
        input.remove();
        toast('Copied!');
    });

    // Back to inbox
    document.getElementById('btn-back-inbox').addEventListener('click', () => {
        const inboxEl = document.getElementById('inbox-section');
        const detailEl = document.getElementById('email-detail');
        detailEl.classList.remove('open');
        detailEl.classList.add('hidden');
        inboxEl.classList.remove('hidden');
        void inboxEl.offsetHeight;
        inboxEl.classList.add('open');
    });

    // Delete email address + auto-generate new (like premiumisme.info)
    document.getElementById('btn-delete')?.addEventListener('click', async () => {
        if (!currentEmail) {
            toast('No email address active', 'error');
            return;
        }
        try {
            // Delete the address entirely
            await api('/email/address/' + encodeURIComponent(currentEmail), { method: 'DELETE' });

            // Cleanup old email state
            const deletedEmail = currentEmail;
            if (currentEmail) wsUnsubscribe(currentEmail);
            currentEmail = null;
            currentMessage = null;
            selectedIdx = -1;
            currentInbox = [];
            renderInbox();
            localStorage.removeItem('joemail_address');
            removeEmailFromHistory(deletedEmail);

            toast('Email deleted');

            // Auto-generate new random email
            await createRandomEmail();

            // Prune oldest email from history (1 per 1, oldest first)
            pruneOldEmails(currentEmail);
        } catch (e) {
            toast('Failed to delete: ' + e.message, 'error');
        }
    });

    // Delete email from detail view
    document.getElementById('btn-delete-detail')?.addEventListener('click', async () => {
        if (!currentMessage) return;
        try {
            await api('/email/message/' + currentMessage.id, { method: 'DELETE' });
            toast('Email deleted');
            currentMessage = null;
            selectedIdx = -1;
            // Go back to inbox
            const inboxEl = document.getElementById('inbox-section');
            const detailEl = document.getElementById('email-detail');
            detailEl.classList.remove('open');
            inboxEl.classList.remove('hidden');
            void inboxEl.offsetHeight;
            inboxEl.classList.add('open');
            setTimeout(() => { detailEl.classList.add('hidden'); }, 300);
            fetchInbox();
        } catch (e) {
            toast('Failed to delete: ' + e.message, 'error');
        }
    });

    // Enter key in username field
    document.getElementById('new-username').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createCustomEmail();
    });

    // Email dropdown toggle
    const emailDropdownBtn = document.getElementById('email-dropdown-btn');
    const emailDropdownMenu = document.getElementById('email-dropdown-menu');
    if (emailDropdownBtn && emailDropdownMenu) {
        bindTap(emailDropdownBtn, () => {
            renderEmailHistoryDropdown();
            animToggle(emailDropdownMenu, 'dropdown');
        });
        document.addEventListener('click', (e) => {
            if (!emailDropdownBtn.contains(e.target) && !emailDropdownMenu.contains(e.target)) {
                animHide(emailDropdownMenu, 'dropdown');
            }
        });
    }

    // Domain dropdown toggle
    const domainDropdownBtn = document.getElementById('domain-dropdown-btn');
    const domainDropdownMenu = document.getElementById('domain-dropdown-menu');
    if (domainDropdownBtn && domainDropdownMenu) {
        bindTap(domainDropdownBtn, () => {
            animToggle(domainDropdownMenu, 'dropdown');
        });
        document.addEventListener('click', (e) => {
            if (!domainDropdownBtn.contains(e.target) && !domainDropdownMenu.contains(e.target)) {
                animHide(domainDropdownMenu, 'dropdown');
            }
        });
    }
}

// ============================================================
// UTILS
// ============================================================
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        const time = d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

        if (diffMins < 1) return 'Baru saja';
        if (diffMins < 60) return `${diffMins}m lalu  ${time}`;
        if (diffHrs < 24) return `${diffHrs}j lalu  ${time}`;
        if (diffDays < 7) {
            const hari = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
            return `${hari[d.getDay()]}  ${time}`;
        }
        const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
        return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}  ${time}`;
    } catch {
        return dateStr;
    }
}