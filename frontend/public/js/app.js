// JoeMail Frontend - Premiumisme.info clone
const API_BASE = '/api';
let currentEmail = null;
let currentInbox = [];
let pollInterval = null;
let availableDomains = [];
let selectedDomain = null;
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
});

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
        throw new Error(err.error || err.message || 'API error');
    }
    return res.json();
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
    // Remove display:none first so transition can play
    el.style.display = '';
    el.classList.remove('hidden');
    // Force reflow so browser registers the starting state
    void el.offsetHeight;
    el.classList.add('open');
}

function animHide(el, type) {
    if (!el) return;
    el.classList.remove('open');
    // Wait for transition to finish before hiding
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
        const data = await api('/domains');
        availableDomains = data.domains || [];
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
        a.className = 'dropdown-item';
        a.textContent = domain.name;
        a.addEventListener('click', () => {
            selectedDomain = domain.name;
            display.value = domain.name;
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

function renderEmailHistoryDropdown() {
    const list = document.getElementById('email-dropdown-list');
    if (!list) return;
    const history = getEmailHistory();
    list.innerHTML = '';

    if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'px-4 py-2 text-sm leading-5 text-gray-500 dark:text-gray-300';
        empty.textContent = 'No previous emails';
        list.appendChild(empty);
        return;
    }

    history.forEach(email => {
        const a = document.createElement('a');
        a.className = 'block px-4 py-2 text-sm leading-5 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-700 transition duration-150 ease-in-out';
        a.textContent = email;
        a.addEventListener('click', () => selectEmailFromHistory(email));
        list.appendChild(a);
    });
}

function selectEmailFromHistory(email, scroll = true) {
    currentEmail = email;
    localStorage.setItem('joemail_address', email);
    document.getElementById('email-display').textContent = email;
    animHide(document.getElementById('email-dropdown-menu'), 'dropdown');
    saveEmailToHistory(email);
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
function loadExistingEmail() {
    renderEmailHistoryDropdown();
    const saved = localStorage.getItem('joemail_address');
    if (saved) {
        currentEmail = saved;
        document.getElementById('email-display').textContent = saved;
        saveEmailToHistory(saved);
        startPolling();
    } else {
        createRandomEmail();
    }
}

async function createRandomEmail(prefix = null) {
    try {
        let url = prefix ? `/generate?prefix=${encodeURIComponent(prefix)}` : '/generate';
        if (selectedDomain) {
            url += (url.includes('?') ? '&' : '?') + `domain=${encodeURIComponent(selectedDomain)}`;
        }
        const data = await api(url);

        currentEmail = data.email;
        localStorage.setItem('joemail_address', data.email);
        saveEmailToHistory(data.email);

        document.getElementById('email-display').textContent = data.email;
        showEmailView();
        startPolling();
        // Premiumisme 1:1: no auto toast on initial email creation
        // toast('Email created: ' + data.email);
    } catch (e) {
        console.error('Create email failed:', e);
        document.getElementById('email-display').textContent = 'Error - click New';
        toast('Failed to create email: ' + e.message, 'error');
    }
}

async function createCustomEmail() {
    const username = document.getElementById('new-username').value.trim();
    if (!username) return toast('Enter a username', 'error');
    await createRandomEmail(username);
}

async function deleteEmail() {
    if (!currentEmail) {
        // No current email — just generate a new one
        await createRandomEmail();
        return;
    }
    const display = document.getElementById('email-display');
    display.style.transition = 'opacity 0.2s ease';
    display.style.opacity = '0';
    setTimeout(async () => {
        // Remove current email from history
        const history = getEmailHistory().filter(item => item !== currentEmail);
        localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(history));

        localStorage.removeItem('joemail_address');
        currentEmail = null;
        currentInbox = [];
        stopPolling();

        // Clear inbox display
        document.getElementById('inbox-list').innerHTML = '';
        document.getElementById('inbox-empty').classList.remove('hidden');
        document.getElementById('email-detail').classList.add('hidden');

        renderEmailHistoryDropdown();
        display.textContent = '';
        display.style.opacity = '1';

        if (history.length > 0) {
            // Switch to the newest remaining email
            selectEmailFromHistory(history[0], false);
            showEmailView();
        } else {
            // No emails left — auto-generate a new one
            await createRandomEmail();
        }
    }, 200);
}

function instantViewSwap(showEl, hideEl) {
    if (!showEl || !hideEl) return;
    hideEl.classList.remove('open');
    hideEl.classList.add('hidden');
    hideEl.style.display = '';
    showEl.classList.remove('hidden');
    showEl.style.display = '';
    showEl.classList.add('open');
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
        const data = await api(`/inbox/${encodeURIComponent(currentEmail)}`);
        currentInbox = data.messages || [];
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

    // Stop spinner after fetch (like premiumisme)
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
        item.className = 'inbox-item inbox-fade-in';
        item.style.animationDelay = `${idx * 0.05}s`;
        item.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1 min-w-0">
                    <div class="from">${escapeHtml(msg.from || 'Unknown')}</div>
                    <div class="subject truncate">${escapeHtml(msg.subject || '(no subject)')}</div>
                </div>
                <div class="date ml-3 whitespace-nowrap">${formatDate(msg.date || msg.createdAt)}</div>
            </div>
        `;
        item.addEventListener('click', () => showMessage(msg, idx));
        list.appendChild(item);
    });
}

async function showMessage(msg, idx) {
    if (msg.id) {
        try {
            const detail = await api(`/message/${msg.id}`);
            msg = detail;
        } catch (e) {
            console.error('Failed to fetch message detail:', e);
        }
    }

    animHide(document.getElementById('inbox-section'), 'view');
    setTimeout(() => animShow(document.getElementById('email-detail'), 'view'), 50);

    document.getElementById('detail-from').textContent = msg.from || 'Unknown';
    document.getElementById('detail-subject').textContent = msg.subject || '(no subject)';
    document.getElementById('detail-date').textContent = formatDate(msg.date || msg.createdAt);

    const bodyEl = document.getElementById('detail-body');
    const body = msg.html || msg.body || msg.text || msg.content || '';
    if (msg.html || (body.includes('<') && body.includes('>') && body.includes('/'))) {
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
    // Refresh (remove pause-spinner on click like premiumisme)
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
    bindTap(document.getElementById('btn-delete'), deleteEmail);

    // Create email
    bindTap(document.getElementById('btn-create-email'), createCustomEmail);

    // Random email
    bindTap(document.getElementById('btn-random'), () => {
        createRandomEmail();
    });

    // Copy button - Premiumisme style: copy only when icon is clicked, not when email text is clicked
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
        animHide(document.getElementById('email-detail'), 'view');
        setTimeout(() => animShow(document.getElementById('inbox-section'), 'view'), 50);
    });

    // Email text/dropdown click opens history only. Copy stays only on copy icon.

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
        // Close on outside click
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
        // Close on outside click
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

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

// Auto-polling like premiumisme (every 15 seconds)
let autoPollCounter = parseInt('15');
setInterval(() => {
    if (autoPollCounter === 0 && !document.hidden && currentEmail) {
        fetchInbox();
        autoPollCounter = parseInt('15');
    }
    autoPollCounter--;
    if (document.hidden) {
        autoPollCounter = 1;
    }
}, 1000);
