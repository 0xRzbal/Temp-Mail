// JoeMail Admin - Settings
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

(async function() {
    const content = document.getElementById('content');
    if (!content) return;

    content.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
                <h2 style="font-size:18px;font-weight:600;margin:0;">Settings</h2>
                <p style="color:var(--text-secondary);font-size:13px;margin:4px 0 0;">System configuration and admin settings</p>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3><i class="fas fa-server"></i> System Information</h3></div>
            <div class="card-body">
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">
                    <div>
                        <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Public IP</div>
                        <div style="font-size:15px;font-weight:500;margin-top:4px;" id="sys-ip">Loading...</div>
                    </div>
                    <div>
                        <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Hostname</div>
                        <div style="font-size:15px;font-weight:500;margin-top:4px;" id="sys-hostname">Loading...</div>
                    </div>
                    <div>
                        <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">API Status</div>
                        <div style="font-size:15px;font-weight:500;margin-top:4px;" id="sys-api-status">Loading...</div>
                    </div>
                    <div>
                        <div style="font-size:12px;color:var(--text-secondary);text-transform:uppercase;font-weight:600;">Uptime</div>
                        <div style="font-size:15px;font-weight:500;margin-top:4px;" id="sys-uptime">-</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3><i class="fas fa-shield-alt"></i> Change Admin Password</h3></div>
            <div class="card-body">
                <div style="max-width:400px;">
                    <div class="form-group">
                        <label>Current Password</label>
                        <input type="password" id="current-password" placeholder="Enter current password">
                    </div>
                    <div class="form-group">
                        <label>New Password</label>
                        <input type="password" id="new-password" placeholder="Enter new password (min 6 chars)">
                    </div>
                    <div class="form-group">
                        <label>Confirm New Password</label>
                        <input type="password" id="confirm-password" placeholder="Confirm new password">
                    </div>
                    <button type="button" class="btn-primary" onclick="changePassword()"><i class="fas fa-key"></i> Change Password</button>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3><i class="fas fa-palette"></i> Appearance</h3></div>
            <div class="card-body">
                <div style="display:flex;align-items:center;gap:12px;">
                    <span style="font-size:14px;">Theme:</span>
                    <button class="btn-ghost" onclick="setTheme('light')" id="theme-light"><i class="fas fa-sun"></i> Light</button>
                    <button class="btn-ghost" onclick="setTheme('dark')" id="theme-dark"><i class="fas fa-moon"></i> Dark</button>
                    <button class="btn-ghost" onclick="setTheme('auto')" id="theme-auto"><i class="fas fa-adjust"></i> Auto</button>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header"><h3><i class="fas fa-info-circle"></i> About</h3></div>
            <div class="card-body">
                <div style="font-size:14px;color:var(--text-secondary);">
                    <p style="margin:0 0 8px;"><strong>JoeMail</strong> - Temporary email service</p>
                    <p style="margin:0 0 8px;">Admin panel for managing emails, addresses, domains, and SMTP relay.</p>
                    <p style="margin:0;">API docs: <code>/api/docs</code> (if enabled)</p>
                </div>
            </div>
        </div>`;

    await loadSystemInfo();
    highlightCurrentTheme();
})();

async function loadSystemInfo() {
    try {
        const res = await api('/server-info');
        if (res.success) {
            const el = (id) => document.getElementById(id);
            if (el('sys-ip')) el('sys-ip').textContent = res.data.ip || '-';
            if (el('sys-hostname')) el('sys-hostname').textContent = res.data.hostname || '-';
            if (el('sys-api-status')) el('sys-api-status').innerHTML = '<span style="color:var(--success);">Online</span>';
        }
    } catch (e) {
        const el = (id) => document.getElementById(id);
        if (el('sys-api-status')) el('sys-api-status').innerHTML = '<span style="color:var(--error);">Error</span>';
    }
}

async function changePassword() {
    const current = document.getElementById('current-password').value;
    const newPw = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;

    if (!current || !newPw || !confirm) { toast('All fields required', 'error'); return; }
    if (newPw.length < 6) { toast('New password must be at least 6 characters', 'error'); return; }
    if (newPw !== confirm) { toast('New passwords do not match', 'error'); return; }

    const res = await api('/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: current, newPassword: newPw })
    });

    if (res.success) {
        toast('Password changed successfully');
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
    } else {
        toast(res.message || 'Failed to change password', 'error');
    }
}

function setTheme(theme) {
    localStorage.setItem('joemail-theme', theme);
    applyTheme(theme);
    highlightCurrentTheme();
    toast('Theme set to ' + theme);
}

function applyTheme(theme) {
    if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function highlightCurrentTheme() {
    const current = localStorage.getItem('joemail-theme') || 'light';
    ['light', 'dark', 'auto'].forEach(t => {
        const btn = document.getElementById('theme-' + t);
        if (btn) {
            btn.style.background = t === current ? 'var(--accent)' : '';
            btn.style.color = t === current ? '#fff' : '';
        }
    });
}
