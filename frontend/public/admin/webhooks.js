// JoeMail Admin - Webhooks v2
if (!requireAuth()) location.href = '/admin/';

async function loadWebhooks() {
    try {
        const data = await api('/webhooks');
        if (!data.success) throw new Error(data.message);
        const d = data.data;

        const webhookRows = (d.webhooks || []).map(w => `
            <tr>
                <td data-label="URL" style="max-width:260px; overflow:hidden; text-overflow:ellipsis;">${w.url}</td>
                <td data-label="Events">${w.events}</td>
                <td data-label="Status"><span class="status ${w.isActive ? 'ok' : 'error'}">${w.isActive ? 'Active' : 'Off'}</span></td>
                <td data-label="OK">${w.successCount}</td>
                <td data-label="Fail">${w.failureCount}</td>
                <td data-label="Last">${formatDate(w.lastTriggered)}</td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="empty-state">No webhooks configured</td></tr>';

        document.getElementById('content').innerHTML = `
            <h2 class="page-title">Webhooks</h2>
            <p class="page-subtitle">Manage webhook endpoints</p>
            <div class="card">
                <div class="card-header">
                    <h3>Configured Webhooks</h3>
                    <span class="badge">${(d.webhooks || []).length} webhooks</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>OK</th><th>Fail</th><th>Last</th></tr></thead>
                        <tbody>${webhookRows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

loadWebhooks();
