// JoeMail Admin - SMTP Relay
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

const RELAY_PRESETS = {
    smtp2go:  { host: 'mail.smtp2go.com', port: '2525', name: 'SMTP2GO' },
    sendgrid: { host: 'smtp.sendgrid.net', port: '587', name: 'SendGrid' },
    mailgun:  { host: 'smtp.mailgun.org', port: '587', name: 'Mailgun' },
    ses:      { host: 'email-smtp.us-east-1.amazonaws.com', port: '587', name: 'Amazon SES' },
    brevo:    { host: 'smtp-relay.brevo.com', port: '587', name: 'Brevo' },
    resend:   { host: 'smtp.resend.com', port: '465', name: 'Resend' }
};

(async function() {
    const content = document.getElementById('content');
    if (!content) return;

    content.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
                <h2 style="font-size:18px;font-weight:600;margin:0;">SMTP Relay</h2>
                <p style="color:var(--text-secondary);font-size:13px;margin:4px 0 0;">Configure outbound email relay</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <span class="badge" id="relay-status-badge"><i class="fas fa-circle"></i> <span id="relay-status-text">Checking...</span></span>
                <button class="btn-ghost" onclick="loadRelay()"><i class="fas fa-sync-alt"></i></button>
            </div>
        </div>
        <div class="stat-grid stat-grid-3">
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-exchange-alt"></i></div><div class="stat-value" id="stat-status">-</div><div class="stat-label">Relay Status</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-server"></i></div><div class="stat-value" id="stat-host">-</div><div class="stat-label">Relay Host</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-clock"></i></div><div class="stat-value" id="stat-updated">-</div><div class="stat-label">Last Updated</div></div>
        </div>
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-cog"></i> Relay Configuration</h3>
                <button class="btn-ghost" onclick="document.getElementById('presets-panel').style.display=document.getElementById('presets-panel').style.display==='none'?'':'none'"><i class="fas fa-magic"></i> Presets</button>
            </div>
            <div class="card-body">
                <div id="presets-panel" style="display:none;margin-bottom:16px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;margin-bottom:12px;">
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('smtp2go')"><strong>SMTP2GO</strong><br><span style="color:var(--text-secondary);font-size:12px;">mail.smtp2go.com:2525</span></button>
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('sendgrid')"><strong>SendGrid</strong><br><span style="color:var(--text-secondary);font-size:12px;">smtp.sendgrid.net:587</span></button>
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('mailgun')"><strong>Mailgun</strong><br><span style="color:var(--text-secondary);font-size:12px;">smtp.mailgun.org:587</span></button>
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('ses')"><strong>Amazon SES</strong><br><span style="color:var(--text-secondary);font-size:12px;">email-smtp.*.amazonaws.com:587</span></button>
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('brevo')"><strong>Brevo</strong><br><span style="color:var(--text-secondary);font-size:12px;">smtp-relay.brevo.com:587</span></button>
                        <button class="btn-ghost" style="text-align:left;padding:10px 12px;" onclick="applyPreset('resend')"><strong>Resend</strong><br><span style="color:var(--text-secondary);font-size:12px;">smtp.resend.com:465</span></button>
                    </div>
                    <hr style="border:none;border-top:1px solid var(--border);">
                </div>
                <form onsubmit="return false">
                    <div style="display:grid;grid-template-columns:1fr 120px;gap:12px;">
                        <div class="form-group"><label>SMTP Host</label><input type="text" id="relay-host" placeholder="mail.smtp2go.com"></div>
                        <div class="form-group"><label>Port</label><input type="text" id="relay-port" value="2525"></div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="form-group"><label>Username</label><input type="text" id="relay-username" placeholder="SMTP username"></div>
                        <div class="form-group"><label>Password</label><input type="password" id="relay-password" placeholder="SMTP password"></div>
                    </div>
                    <div class="form-group" style="margin-bottom:16px;">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="relay-enabled" checked> Enable relay for all outbound emails</label>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button type="button" class="btn-ghost" onclick="testRelayConnection()"><i class="fas fa-plug"></i> Test Connection</button>
                        <button type="button" class="btn-primary" onclick="saveRelay()"><i class="fas fa-save"></i> Save & Apply</button>
                    </div>
                </form>
            </div>
        </div>
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-paper-plane"></i> Send Test Email</h3></div>
            <div class="card-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="form-group"><label>From</label><input type="email" id="test-from" value="herman@rzbal.biz.id"></div>
                    <div class="form-group"><label>To</label><input type="email" id="test-to" placeholder="recipient@example.com"></div>
                </div>
                <button type="button" class="btn-primary" onclick="sendRelayTestEmail()"><i class="fas fa-paper-plane"></i> Send Test</button>
            </div>
        </div>
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-terminal"></i> Relay Logs</h3>
                <select id="log-lines" onchange="loadRelayLogs()" style="padding:4px 8px;font-size:12px;">
                    <option value="25">Last 25</option><option value="50" selected>Last 50</option><option value="100">Last 100</option>
                </select>
            </div>
            <div class="card-body"><pre id="relay-logs" style="background:var(--bg-secondary);padding:12px;border-radius:8px;font-size:12px;max-height:200px;overflow:auto;word-break:break-all;font-family:monospace;">Loading...</pre></div>
        </div>`;

    await loadRelay();
    await loadRelayLogs();
})();

async function loadRelay() {
    const res = await api('/relay/config');
    if (!res.success) return;
    const c = res.data;
    const h = document.getElementById('relay-host');
    if (!h) return;
    h.value = c.host || '';
    document.getElementById('relay-port').value = c.port || '2525';
    document.getElementById('relay-username').value = c.username || '';
    document.getElementById('relay-password').value = c.password || '';
    document.getElementById('relay-enabled').checked = c.enabled !== false;
    const active = c.enabled && c.host;
    const badge = document.getElementById('relay-status-badge');
    if (badge) badge.className = 'badge ' + (active ? 'badge-green' : 'badge-red');
    const st = document.getElementById('relay-status-text');
    if (st) st.textContent = active ? 'Active' : 'Inactive';
    const ss = document.getElementById('stat-status');
    if (ss) ss.textContent = active ? 'Active' : 'Inactive';
    const sh = document.getElementById('stat-host');
    if (sh) sh.textContent = c.host ? c.host+':'+c.port : '-';
    const su = document.getElementById('stat-updated');
    if (su) su.textContent = new Date().toLocaleTimeString('id-ID');
}

async function saveRelay() {
    const config = { host: document.getElementById('relay-host').value, port: document.getElementById('relay-port').value, username: document.getElementById('relay-username').value, password: document.getElementById('relay-password').value, enabled: document.getElementById('relay-enabled').checked };
    if (!config.host || !config.username || !config.password) { toast('Host, username, and password required', 'error'); return; }
    const res = await api('/relay/config', { method: 'POST', body: JSON.stringify(config) });
    if (res.success) { toast('Relay config saved'); await loadRelay(); } else toast(res.message || 'Failed', 'error');
}

async function testRelayConnection() {
    const config = { host: document.getElementById('relay-host').value, port: document.getElementById('relay-port').value, username: document.getElementById('relay-username').value, password: document.getElementById('relay-password').value };
    if (!config.host || !config.username || !config.password) { toast('Fill in all fields', 'error'); return; }
    toast('Testing connection...');
    const res = await api('/relay/test', { method: 'POST', body: JSON.stringify(config) });
    if (res.success) toast('Connection successful!'); else toast(res.message || 'Connection failed', 'error');
}

async function sendRelayTestEmail() {
    const from = document.getElementById('test-from').value;
    const to = document.getElementById('test-to').value;
    if (!from || !to) { toast('From and To required', 'error'); return; }
    toast('Sending test email...');
    const res = await api('/relay/test-send', { method: 'POST', body: JSON.stringify({ from, to }) });
    if (res.success) toast('Test email sent!'); else toast(res.message || 'Failed', 'error');
}

async function loadRelayLogs() {
    const lines = document.getElementById('log-lines') ? document.getElementById('log-lines').value : '50';
    const res = await api('/relay/logs?lines=' + lines);
    if (!res.success) return;
    const el = document.getElementById('relay-logs');
    if (el) el.textContent = res.data.logs || 'No logs';
}

function applyPreset(key) {
    const p = RELAY_PRESETS[key];
    document.getElementById('relay-host').value = p.host;
    document.getElementById('relay-port').value = p.port;
    document.getElementById('presets-panel').style.display = 'none';
    toast(p.name + ' preset applied');
}
