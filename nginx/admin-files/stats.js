// JoeMail Admin - Statistics
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

(async function() {
    const content = document.getElementById('content');
    if (!content) return;

    content.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <div>
                <h2 style="font-size:18px;font-weight:600;margin:0;">Statistics</h2>
                <p style="color:var(--text-secondary);font-size:13px;margin:4px 0 0;">Email and system usage statistics</p>
            </div>
            <select id="stat-days" onchange="loadStats()" style="padding:6px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--bg);">
                <option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option>
            </select>
        </div>
        <div class="stat-grid">
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-envelope"></i></div><div class="stat-value" id="stat-total-emails">-</div><div class="stat-label">Total Emails</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-user-plus"></i></div><div class="stat-value" id="stat-total-addresses">-</div><div class="stat-label">Total Addresses</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-trash"></i></div><div class="stat-value" id="stat-total-deleted">-</div><div class="stat-label">Deleted</div></div>
            <div class="stat-card"><div class="stat-icon"><i class="fas fa-share"></i></div><div class="stat-value" id="stat-total-forwarded">-</div><div class="stat-label">Forwarded</div></div>
        </div>
        <div class="card">
            <div class="card-header"><h3><i class="fas fa-chart-bar"></i> Daily Breakdown</h3></div>
            <div class="card-body" style="padding:0;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead><tr>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">DATE</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">EMAILS</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">ADDRESSES</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">DELETED</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">FORWARDED</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">REPLIED</th>
                        <th style="text-align:left;padding:10px 14px;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border);">DOMAINS</th>
                    </tr></thead>
                    <tbody id="stats-list"><tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-secondary);">Loading...</td></tr></tbody>
                </table>
            </div>
        </div>`;

    await loadStats();
})();

async function loadStats() {
    const days = document.getElementById('stat-days') ? document.getElementById('stat-days').value : '30';
    const res = await api('/stats?days=' + days);
    if (!res.success) return;
    const t = res.data.totals;
    const el = (id) => document.getElementById(id);
    if (el('stat-total-emails')) el('stat-total-emails').textContent = t.totalEmails;
    if (el('stat-total-addresses')) el('stat-total-addresses').textContent = t.totalAddresses;
    if (el('stat-total-deleted')) el('stat-total-deleted').textContent = t.totalDeleted;
    if (el('stat-total-forwarded')) el('stat-total-forwarded').textContent = t.totalForwarded;
    const tbody = el('stats-list');
    if (!tbody) return;
    if (!res.data.daily || res.data.daily.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;">No stats yet</td></tr>'; return; }
    tbody.innerHTML = res.data.daily.map(s => '<tr>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+s.date+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.emails_received||0)+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.addresses_created||0)+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.emails_deleted||0)+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.emails_forwarded||0)+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.emails_replied||0)+'</td>' +
        '<td style="padding:8px 14px;border-bottom:1px solid var(--border);">'+(s.custom_domains_added||0)+'</td>' +
    '</tr>').join('');
}
