// JoeMail Admin - SMTP Relay v6
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

var RELAY_PRESETS = {
    smtp2go:  { host: 'mail.smtp2go.com', port: '2525', name: 'SMTP2GO' },
    sendgrid: { host: 'smtp.sendgrid.net', port: '587', name: 'SendGrid' },
    mailgun:  { host: 'smtp.mailgun.org', port: '587', name: 'Mailgun' },
    ses:      { host: 'email-smtp.us-east-1.amazonaws.com', port: '587', name: 'Amazon SES' },
    brevo:    { host: 'smtp-relay.brevo.com', port: '587', name: 'Brevo' },
    resend:   { host: 'smtp.resend.com', port: '465', name: 'Resend' }
};

var presetsVisible = false;

function renderRelay() {
    var presetBtns = '';
    Object.keys(RELAY_PRESETS).forEach(function(key) {
        var p = RELAY_PRESETS[key];
        presetBtns += '<button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset(\'' + key + '\')">' +
            '<strong>' + p.name + '</strong><br>' +
            '<span style="color:var(--text-muted);font-size:11px;">' + p.host + ':' + p.port + '</span></button>';
    });

    document.getElementById('content').innerHTML =
        '<div class="page-header-row">' +
            '<div>' +
                '<h2 class="page-title" style="margin-bottom:0;">SMTP Relay</h2>' +
                '<p class="page-subtitle" style="margin-bottom:0;">Configure outbound email relay</p>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
                '<span class="badge" id="relay-status-badge"><i class="fas fa-circle"></i> <span id="relay-status-text">Checking...</span></span>' +
                '<button class="btn-ghost btn-sm" onclick="loadRelay()"><i class="fas fa-sync-alt"></i></button>' +
            '</div>' +
        '</div>' +

        // Status cards
        '<div class="relay-stat-grid">' +
            '<div class="relay-stat-card"><div class="relay-stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="relay-stat-info"><div class="relay-stat-value" id="stat-status">-</div><div class="relay-stat-label">Relay Status</div></div></div>' +
            '<div class="relay-stat-card"><div class="relay-stat-icon"><i class="fas fa-server"></i></div><div class="relay-stat-info"><div class="relay-stat-value" id="stat-host">-</div><div class="relay-stat-label">Relay Host</div></div></div>' +
            '<div class="relay-stat-card"><div class="relay-stat-icon"><i class="fas fa-clock"></i></div><div class="relay-stat-info"><div class="relay-stat-value" id="stat-updated">-</div><div class="relay-stat-label">Last Updated</div></div></div>' +
        '</div>' +

        // Config card
        '<div class="card">' +
            '<div class="card-header">' +
                '<h3><i class="fas fa-cog"></i> Relay Configuration</h3>' +
                '<button class="btn-ghost btn-sm" onclick="togglePresets()"><i class="fas fa-magic"></i> Presets</button>' +
            '</div>' +
            '<div class="card-body">' +
                '<div id="presets-panel" style="display:none;margin-bottom:16px;">' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-bottom:12px;">' + presetBtns + '</div>' +
                    '<hr style="border:none;border-top:1px solid var(--border);">' +
                '</div>' +
                '<form onsubmit="return false">' +
                    '<div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">' +
                        '<div class="form-group"><label>SMTP Host</label><input type="text" id="relay-host" class="form-input" placeholder="mail.smtp2go.com"></div>' +
                        '<div class="form-group"><label>Port</label><input type="text" id="relay-port" class="form-input" value="2525"></div>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                        '<div class="form-group"><label>Username</label><input type="text" id="relay-username" class="form-input" placeholder="SMTP username"></div>' +
                        '<div class="form-group"><label>Password</label><input type="password" id="relay-password" class="form-input" placeholder="SMTP password"></div>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:16px;">' +
                        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
                            '<input type="checkbox" id="relay-enabled" checked> Enable relay for all outbound emails' +
                        '</label>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<button type="button" class="btn-ghost" onclick="testRelayConnection()"><i class="fas fa-plug"></i> Test Connection</button>' +
                        '<button type="button" class="btn-primary" onclick="saveRelay()"><i class="fas fa-save"></i> Save & Apply</button>' +
                    '</div>' +
                '</form>' +
            '</div>' +
        '</div>' +

        // Test email card
        '<div class="card">' +
            '<div class="card-header"><h3><i class="fas fa-paper-plane"></i> Send Test Email</h3></div>' +
            '<div class="card-body">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                    '<div class="form-group"><label>From</label><input type="email" id="test-from" class="form-input" value="herman@rzbal.biz.id"></div>' +
                    '<div class="form-group"><label>To</label><input type="email" id="test-to" class="form-input" placeholder="recipient@example.com"></div>' +
                '</div>' +
                '<button type="button" class="btn-primary" onclick="sendRelayTestEmail()"><i class="fas fa-paper-plane"></i> Send Test</button>' +
            '</div>' +
        '</div>' +

        // Logs card
        '<div class="card">' +
            '<div class="card-header">' +
                '<h3><i class="fas fa-terminal"></i> Relay Logs</h3>' +
                '<select id="log-lines" onchange="loadRelayLogs()" style="padding:4px 8px;font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-xs);color:var(--text);">' +
                    '<option value="25">Last 25</option><option value="50" selected>Last 50</option><option value="100">Last 100</option>' +
                '</select>' +
            '</div>' +
            '<div class="card-body" style="padding:0;">' +
                '<pre id="relay-logs" style="padding:12px;font-size:12px;max-height:200px;overflow:auto;word-break:break-all;font-family:monospace;margin:0;">Loading...</pre>' +
            '</div>' +
        '</div>';

    loadRelay();
    loadRelayLogs();
}

function togglePresets() {
    var panel = document.getElementById('presets-panel');
    presetsVisible = !presetsVisible;
    panel.style.display = presetsVisible ? '' : 'none';
}

function applyPreset(key) {
    var p = RELAY_PRESETS[key];
    document.getElementById('relay-host').value = p.host;
    document.getElementById('relay-port').value = p.port;
    document.getElementById('presets-panel').style.display = 'none';
    presetsVisible = false;
    toast(p.name + ' preset applied');
}

async function loadRelay() {
    var res = await api('/relay/config');
    if (!res.success) return;
    var c = res.data;
    var h = document.getElementById('relay-host');
    if (!h) return;
    h.value = c.host || '';
    document.getElementById('relay-port').value = c.port || '2525';
    document.getElementById('relay-username').value = c.username || '';
    document.getElementById('relay-password').value = c.password || '';
    document.getElementById('relay-enabled').checked = c.enabled !== false;

    var active = c.enabled && c.host;
    var badge = document.getElementById('relay-status-badge');
    if (badge) badge.className = 'badge ' + (active ? 'badge-green' : 'badge-red');
    var st = document.getElementById('relay-status-text');
    if (st) st.textContent = active ? 'Active' : 'Inactive';
    var ss = document.getElementById('stat-status');
    if (ss) ss.textContent = active ? 'Active' : 'Inactive';
    var sh = document.getElementById('stat-host');
    if (sh) sh.textContent = c.host ? c.host + ':' + c.port : '-';
    var su = document.getElementById('stat-updated');
    if (su) su.textContent = new Date().toLocaleTimeString('id-ID');
}

async function saveRelay() {
    var config = {
        host: document.getElementById('relay-host').value,
        port: document.getElementById('relay-port').value,
        username: document.getElementById('relay-username').value,
        password: document.getElementById('relay-password').value,
        enabled: document.getElementById('relay-enabled').checked
    };
    if (!config.host || !config.username || !config.password) { toast('Host, username, and password required', 'error'); return; }
    var res = await api('/relay/config', { method: 'POST', body: JSON.stringify(config) });
    if (res.success) { toast('Relay config saved'); await loadRelay(); } else toast(res.message || 'Failed', 'error');
}

async function testRelayConnection() {
    var config = {
        host: document.getElementById('relay-host').value,
        port: document.getElementById('relay-port').value,
        username: document.getElementById('relay-username').value,
        password: document.getElementById('relay-password').value
    };
    if (!config.host || !config.username || !config.password) { toast('Fill in all fields', 'error'); return; }
    toast('Testing connection...');
    var res = await api('/relay/test', { method: 'POST', body: JSON.stringify(config) });
    if (res.success) toast('Connection successful!'); else toast(res.message || 'Connection failed', 'error');
}

async function sendRelayTestEmail() {
    var from = document.getElementById('test-from').value;
    var to = document.getElementById('test-to').value;
    if (!from || !to) { toast('From and To required', 'error'); return; }
    toast('Sending test email...');
    var res = await api('/relay/test-send', { method: 'POST', body: JSON.stringify({ from: from, to: to }) });
    if (res.success) toast('Test email sent!'); else toast(res.message || 'Failed', 'error');
}

async function loadRelayLogs() {
    var el = document.getElementById('log-lines');
    var lines = el ? el.value : '50';
    var res = await api('/relay/logs?lines=' + lines);
    if (!res.success) return;
    var logEl = document.getElementById('relay-logs');
    if (logEl) {
        var logs = res.data.logs;
        if (typeof logs === 'string') logEl.textContent = logs || 'No logs';
        else if (Array.isArray(logs)) logEl.textContent = logs.join('\n') || 'No logs';
        else logEl.textContent = JSON.stringify(logs, null, 2) || 'No logs';
    }
}

// Init
renderRelay();
