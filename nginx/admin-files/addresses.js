// JoeMail Admin - Addresses v1 with Bulk Delete
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

var selectedAddresses = new Set();
var allAddresses = [];

function toggleAddrCheck(email, checked) {
    if (checked) selectedAddresses.add(email); else selectedAddresses.delete(email);
    updateBulkBar();
}

function toggleAllAddr(checked) {
    if (!checked) selectedAddresses.clear();
    document.querySelectorAll('.bulk-check').forEach(cb => {
        cb.checked = checked;
        const email = cb.dataset.email;
        if (checked) selectedAddresses.add(email); else selectedAddresses.delete(email);
    });
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    const count = selectedAddresses.size;
    if (count > 0) {
        bar.classList.add('show');
        bar.querySelector('.bulk-count').textContent = count + ' selected';
    } else {
        bar.classList.remove('show');
    }
}

async function bulkDeleteAddresses() {
    const count = selectedAddresses.size;
    if (count === 0) return;
    if (!confirm('Ban and delete ' + count + ' addresses? This removes all their emails.')) return;
    try {
        const data = await api('/users/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ emails: Array.from(selectedAddresses) })
        });
        if (data.success) {
            toast(count + ' addresses deleted');
            selectedAddresses.clear();
            loadAddresses();
        } else {
            toast(data.message || 'Failed', 'error');
        }
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteAddress(email) {
    if (!confirm('Ban and delete address: ' + email + '?')) return;
    try {
        const data = await api('/user/' + encodeURIComponent(email), { method: 'DELETE' });
        if (data.success) { toast('Address deleted'); selectedAddresses.delete(email); loadAddresses(); }
        else { toast(data.message || 'Failed', 'error'); }
    } catch (e) { toast(e.message, 'error'); }
}

async function loadAddresses(page = 1) {
    try {
        const data = await api('/users?page=' + page + '&limit=50');
        if (!data.success) throw new Error(data.message);
        const d = data.data;
        selectedAddresses.clear();
        allAddresses = d.users || [];

        const rows = allAddresses.map(u => `
            <tr>
                <td data-label=""><input type="checkbox" class="bulk-check" data-email="${u.email}" onchange="toggleAddrCheck('${u.email}', this.checked)"></td>
                <td data-label="Email"><span class="status ok">${u.email}</span></td>
                <td data-label="Created">${formatDate(u.createdAt)}</td>
                <td data-label="Last Access">${formatDate(u.lastAccessed)}</td>
                <td data-label="Access #">${u.accessCount}</td>
                <td data-label="Status"><span class="status ${u.isActive ? 'ok' : 'error'}">${u.isActive ? 'Active' : 'Banned'}</span></td>
                <td data-label="Actions">
                    <button class="btn-danger btn-sm" onclick="deleteAddress('${u.email}')" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="empty-state">No addresses</td></tr>';

        const totalPages = Math.ceil(d.pagination.total / 50);
        let paginationHtml = '';
        if (totalPages > 1) {
            paginationHtml = '<div style="display:flex;gap:6px;justify-content:center;margin-top:16px;">';
            for (let i = 1; i <= totalPages; i++) {
                paginationHtml += '<button class="btn-ghost btn-sm' + (i === page ? ' btn-primary' : '') + '" onclick="loadAddresses(' + i + ')">' + i + '</button>';
            }
            paginationHtml += '</div>';
        }

        document.getElementById('content').innerHTML = `
            <div class="page-header-row">
                <div>
                    <h2 class="page-title" style="margin-bottom:0;">Addresses</h2>
                    <p class="page-subtitle" style="margin-bottom:0;">All generated temp email addresses</p>
                </div>
                <div class="stats-bar" style="margin-bottom:0; padding:8px 14px;">
                    <div class="stats-bar-item">
                        <span class="stats-bar-icon"><i class="fas fa-at"></i></span>
                        <span class="stats-bar-value">${d.pagination.total}</span>
                        <span class="stats-bar-label">Total</span>
                    </div>
                </div>
            </div>
            <div id="bulk-bar" class="bulk-bar">
                <input type="checkbox" checked disabled class="bulk-check">
                <span class="bulk-count">0 selected</span>
                <div class="bulk-actions">
                    <button class="btn-danger btn-sm" onclick="bulkDeleteAddresses()"><i class="fas fa-trash"></i> Delete Selected</button>
                    <button class="btn-ghost btn-sm" onclick="selectedAddresses.clear();toggleAllAddr(false);updateBulkBar();">Clear</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3>All Addresses</h3>
                    <span class="badge">${d.pagination.total} total</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th><input type="checkbox" class="bulk-check-header" onchange="toggleAllAddr(this.checked)"></th><th>Email</th><th>Created</th><th>Last Access</th><th>Access #</th><th>Status</th><th>Actions</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
            ${paginationHtml}`;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

loadAddresses();
