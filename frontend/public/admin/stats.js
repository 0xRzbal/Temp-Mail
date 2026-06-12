// JoeMail Admin - Statistics v2
if (!requireAuth()) location.href = '/admin/';

async function loadStats() {
    try {
        const data = await api('/stats');
        if (!data.success) throw new Error(data.message);
        const d = data.data;

        const dailyRows = (d.daily || []).map(s => `
            <tr>
                <td data-label="Date">${s.date}</td>
                <td data-label="Emails">${s.emails_received}</td>
                <td data-label="Addresses">${s.addresses_created}</td>
                <td data-label="Deleted">${s.emails_deleted}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" class="empty-state">No data</td></tr>';

        document.getElementById('content').innerHTML = `
            <h2 class="page-title">Statistics</h2>
            <p class="page-subtitle">Usage statistics and trends</p>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-envelope"></i></div>
                    <div class="stat-value">${d.totals.totalEmails || 0}</div>
                    <div class="stat-label">Total Emails</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-value">${d.totals.totalAddresses || 0}</div>
                    <div class="stat-label">Addresses</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-trash"></i></div>
                    <div class="stat-value">${d.totals.totalDeleted || 0}</div>
                    <div class="stat-label">Deleted</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-share"></i></div>
                    <div class="stat-value">${d.totals.totalForwarded || 0}</div>
                    <div class="stat-label">Forwarded</div>
                </div>
            </div>
            <div class="card">
                <div class="card-header"><h3>Daily (Last 30 Days)</h3></div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Date</th><th>Emails</th><th>Addresses</th><th>Deleted</th></tr></thead>
                        <tbody>${dailyRows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

loadStats();
