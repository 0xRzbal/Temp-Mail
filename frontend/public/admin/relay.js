// JoeMail Admin - SMTP Relay Management
const RELAY_API = '/api/admin/relay';

async function initRelay() {
    const content = document.getElementById('content');
    content.innerHTML = `
        <div class="relay-page">
            <!-- Status Card -->
            <div class="stat-card" id="relay-status-card">
                <div class="stat-card-header">
                    <div class="stat-card-icon"><i class="fas fa-exchange-alt"></i></div>
                    <div class="stat-card-title">Relay Status</div>
                </div>
                <div id="relay-status-content" class="relay-status-content">
                    <div class="spinner" style="margin:20px auto;"></div>
                </div>
            </div>

            <!-- Config Card -->
            <div class="stat-card">
                <div class="stat-card-header">
                    <div class="stat-card-icon"><i class="fas fa-cog"></i></div>
                    <div class="stat-card-title">Relay Configuration</div>
                    <div class="stat-card-actions">
                        <button class="btn btn-sm btn-ghost" onclick="loadPresets()"><i class="fas fa-magic"></i> Presets</button>
                    </div>
                </div>
                <div class="relay-config-form">
                    <div id="preset-list" class="preset-list" style="display:none;"></div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>SMTP Host</label>
                            <input type="text" id="relay-host" placeholder="mail.smtp2go.com">
                        </div>
                        <div class="form-group" style="max-width:120px;">
                            <label>Port</label>
                            <input type="text" id="relay-port" placeholder="2525" value="2525">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="relay-username" placeholder="SMTP username">
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <div class="password-wrap">
                                <input type="password" id="relay-password" placeholder="SMTP password">
                                <button class="btn-password-toggle" onclick="togglePassword()"><i class="fas fa-eye"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="toggle-label">
                                <input type="checkbox" id="relay-enabled" checked>
                                <span>Enable relay for all outbound emails</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" onclick="testConnection()"><i class="fas fa-plug"></i> Test Connection</button>
                        <button class="btn btn-primary" onclick="saveRelayConfig()"><i class="fas fa-save"></i> Save & Apply</button>
                    </div>
                </div>
            </div>

            <!-- Test Email Card -->
            <div class="stat-card">
                <div class="stat-card-header">
                    <div class="stat-card-icon"><i class="fas fa-paper-plane"></i></div>
                    <div class="stat-card-title">Send Test Email</div>
                </div>
                <div class="relay-test-form">
                    <div class="form-row">
                        <div class="form-group">
                            <label>From Address</label>
                            <input type="text" id="test-from" placeholder="test@rzbal.biz.id" value="herman@rzbal.biz.id">
                        </div>
                        <div class="form-group">
                            <label>To Address</label>
                            <input type="email" id="test-to" placeholder="recipient@example.com">
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-primary" onclick="sendTestEmail()"><i class="fas fa-paper-plane"></i> Send Test</button>
                    </div>
                </div>
            </div>

            <!-- Stats Card -->
            <div class="stat-card">
                <div class="stat-card-header">
                    <div class="stat-card-icon"><i class="fas fa-chart-bar"></i></div>
                    <div class="stat-card-title">Relay Statistics</div>
                    <div class="stat-card-actions">
                        <button class="btn btn-sm btn-ghost" onclick="loadRelayStats()"><i class="fas fa-sync"></i></button>
                    </div>
                </div>
                <div id="relay-stats-content">
                    <div class="spinner" style="margin:20px auto;"></div>
                </div>
            </div>

            <!-- Logs Card -->
            <div class="stat-card">
                <div class="stat-card-header">
                    <div class="stat-card-icon"><i class="fas fa-terminal"></i></div>
                    <div class="stat-card-title">Relay Logs</div>
                    <div class="stat-card-actions">
                        <select id="log-lines" onchange="loadRelayLogs()">
                            <option value="25">Last 25 lines</option>
                            <option value="50" selected>Last 50 lines</option>
                            <option value="100">Last 100 lines</option>
                        </select>
                    </div>
                </div>
                <div id="relay-logs-content" class="relay-logs">
                    <div class="spinner" style="margin:20px auto;"></div>
                </div>
            </div>
        </div>
    `;

    await loadRelayConfig();
    await loadRelayStats();
    await loadRelayLogs();
}

async function loadRelayConfig() {
    try {
        const data = await api('/relay/config');
        if (data.success) {
            const config = data.data;
            document.getElementById('relay-host').value = config.host || '';
            document.getElementById('relay-port').value = config.port || '2525';
            document.getElementById('relay-username').value = config.username || '';
            document.getElementById('relay-password').value = config.password || '';
            document.getElementById('relay-enabled').checked = config.enabled !== false;
            updateStatusCard(config);
        }
    } catch (e) {
        console.error('Load config error:', e);
    }
}

function updateStatusCard(config) {
    const content = document.getElementById('relay-status-content');
    if (!content) return;
    
    if (config.active || config.enabled) {
        content.innerHTML = `
            <div class="relay-status-active">
                <div class="status-indicator active">
                    <i class="fas fa-check-circle"></i>
                    <span>Active</span>
                </div>
                <div class="status-details">
                    <div class="status-detail-item">
                        <span class="label">Host:</span>
                        <span class="value">${config.host || config.relayhost || 'N/A'}</span>
                    </div>
                    <div class="status-detail-item">
                        <span class="label">Port:</span>
                        <span class="value">${config.port || '2525'}</span>
                    </div>
                    <div class="status-detail-item">
                        <span class="label">Username:</span>
                        <span class="value">${config.username || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        content.innerHTML = `
            <div class="relay-status-inactive">
                <div class="status-indicator inactive">
                    <i class="fas fa-times-circle"></i>
                    <span>Inactive</span>
                </div>
                <p>SMTP relay is not configured. Configure it below to improve email deliverability.</p>
            </div>
        `;
    }
}

async function loadPresets() {
    const presetList = document.getElementById('preset-list');
    if (presetList.style.display === 'block') {
        presetList.style.display = 'none';
        return;
    }
    
    try {
        const data = await api('/relay/presets');
        if (data.success) {
            presetList.innerHTML = data.data.map(p => `
                <div class="preset-item" onclick="applyPreset('${p.host}', '${p.port}')">
                    <div class="preset-name">${p.name}</div>
                    <div class="preset-desc">${p.description}</div>
                    <div class="preset-host">${p.host}:${p.port}</div>
                </div>
            `).join('');
            presetList.style.display = 'block';
        }
    } catch (e) {
        toast('Failed to load presets', 'error');
    }
}

function applyPreset(host, port) {
    document.getElementById('relay-host').value = host;
    document.getElementById('relay-port').value = port;
    document.getElementById('preset-list').style.display = 'none';
    toast('Preset applied. Enter your credentials and save.');
}

async function saveRelayConfig() {
    const host = document.getElementById('relay-host').value.trim();
    const port = document.getElementById('relay-port').value.trim();
    const username = document.getElementById('relay-username').value.trim();
    const password = document.getElementById('relay-password').value;
    const enabled = document.getElementById('relay-enabled').checked;
    
    if (!host || !username || !password) {
        toast('Host, username, and password are required', 'error');
        return;
    }
    
    try {
        const data = await api('/relay/config', {
            method: 'POST',
            body: JSON.stringify({ host, port, username, password, enabled })
        });
        
        if (data.success) {
            toast(data.message);
            // Refresh status after a delay
            setTimeout(async () => {
                await loadRelayConfig();
                await loadRelayStats();
            }, 6000);
        } else {
            toast(data.message || 'Failed to save config', 'error');
        }
    } catch (e) {
        toast('Network error', 'error');
    }
}

async function testConnection() {
    const host = document.getElementById('relay-host').value.trim();
    const port = document.getElementById('relay-port').value.trim();
    
    if (!host) {
        toast('Fill in host first', 'error');
        return;
    }
    
    try {
        toast('Testing connection...');
        const data = await api('/relay/test', {
            method: 'POST',
            body: JSON.stringify({ host, port })
        });
        
        if (data.success) {
            toast('Connection successful!');
        } else {
            toast(data.message || 'Connection failed', 'error');
        }
    } catch (e) {
        toast('Test failed', 'error');
    }
}

async function sendTestEmail() {
    const from = document.getElementById('test-from').value.trim();
    const to = document.getElementById('test-to').value.trim();
    
    if (!to) {
        toast('Recipient email is required', 'error');
        return;
    }
    
    try {
        const data = await api('/relay/test-send', {
            method: 'POST',
            body: JSON.stringify({ to, from })
        });
        
        if (data.success) {
            toast(data.message);
        } else {
            toast(data.message || 'Failed to send', 'error');
        }
    } catch (e) {
        toast('Send failed', 'error');
    }
}

async function loadRelayStats() {
    try {
        const data = await api('/relay/stats');
        if (data.success) {
            const stats = data.data;
            document.getElementById('relay-stats-content').innerHTML = `
                <div class="relay-stats-grid">
                    <div class="relay-stat-item">
                        <div class="relay-stat-value ${stats.active ? 'text-success' : 'text-muted'}">
                            ${stats.active ? 'Active' : 'Inactive'}
                        </div>
                        <div class="relay-stat-label">Relay Status</div>
                    </div>
                    <div class="relay-stat-item">
                        <div class="relay-stat-value">${stats.relayhost || 'N/A'}</div>
                        <div class="relay-stat-label">Relay Host</div>
                    </div>
                    <div class="relay-stat-item">
                        <div class="relay-stat-value">${stats.updated ? new Date(stats.updated).toLocaleTimeString() : 'N/A'}</div>
                        <div class="relay-stat-label">Last Updated</div>
                    </div>
                </div>
            `;
        }
    } catch (e) {
        document.getElementById('relay-stats-content').innerHTML = '<p class="text-muted">Failed to load stats</p>';
    }
}

async function loadRelayLogs() {
    const lines = document.getElementById('log-lines') ? document.getElementById('log-lines').value : 50;
    try {
        const data = await api('/relay/logs?lines=' + lines);
        if (data.success) {
            const logs = data.data.logs;
            document.getElementById('relay-logs-content').innerHTML = logs.length ? 
                '<pre class="log-pre">' + logs.map(function(l) { return escapeHtml(l); }).join('\n') + '</pre>' :
                '<p class="text-muted">No relay logs found</p>';
        }
    } catch (e) {
        document.getElementById('relay-logs-content').innerHTML = '<p class="text-muted">Failed to load logs</p>';
    }
}

function togglePassword() {
    const input = document.getElementById('relay-password');
    const icon = input.parentElement.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
