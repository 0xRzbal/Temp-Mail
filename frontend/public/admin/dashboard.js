// JoeMail Admin - Dashboard v2

function initDashboard() {
    fetchDashboardData();
}

async function fetchDashboardData() {
    try {
        const data = await api('/dashboard');
        if (!data.success) throw new Error(data.message);
        const d = data.data;

        const emailRows = (d.recentEmails || []).map(e => `
            <tr>
                <td data-label="Email">${e.email}</td>
                <td data-label="From">${e.from || '-'}</td>
                <td data-label="Subject">${e.subject || '-'}</td>
                <td data-label="Date">${formatDate(e.date)}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="empty-state">No emails yet</td></tr>';

        document.getElementById('content').innerHTML = `
            <h2 class="page-title">Dashboard</h2>
            <p class="page-subtitle">Overview of your JoeMail instance</p>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-envelope"></i></div>
                    <div class="stat-value">${d.stats.totalEmails || 0}</div>
                    <div class="stat-label">Total Emails</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-value">${d.stats.totalAddresses || 0}</div>
                    <div class="stat-label">Addresses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-globe"></i></div>
                    <div class="stat-value">${d.stats.totalDomains || 0}</div>
                    <div class="stat-label">Domains</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-clock"></i></div>
                    <div class="stat-value">${Math.round(d.systemHealth.uptime / 60)}m</div>
                    <div class="stat-label">Uptime</div>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3>Recent Emails</h3>
                    <span class="badge">${(d.recentEmails || []).length} recent</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Email</th><th>From</th><th>Subject</th><th>Date</th></tr></thead>
                        <tbody>${emailRows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

