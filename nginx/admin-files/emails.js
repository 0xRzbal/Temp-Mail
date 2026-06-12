// JoeMail Admin - Emails v4 with Auto-Refresh
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

var currentReplyEmailId = null;
var selectedEmails = new Set();
var lastEmailCount = 0;
var refreshInterval = null;
var newEmailCount = 0;

function toggleEmailCheck(id, checked) {
    if (checked) selectedEmails.add(id); else selectedEmails.delete(id);
    updateBulkBar();
}

function toggleAllEmails(checked) {
    document.querySelectorAll('.bulk-check').forEach(cb => {
        cb.checked = checked;
        const id = parseInt(cb.dataset.id);
        if (checked) selectedEmails.add(id); else selectedEmails.delete(id);
    });
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    if (!bar) return;
    const count = selectedEmails.size;
    if (count > 0) {
        bar.classList.add('show');
        bar.querySelector('.bulk-count').textContent = count + ' selected';
    } else {
        bar.classList.remove('show');
    }
}

async function bulkDeleteEmails() {
    const count = selectedEmails.size;
    if (count === 0) return;
    if (!confirm('Delete ' + count + ' emails?')) return;
    try {
        const data = await api('/emails/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids: Array.from(selectedEmails) })
        });
        if (data.success) {
            toast(count + ' emails deleted');
            selectedEmails.clear();
            loadEmails();
        } else {
            toast(data.message || 'Failed', 'error');
        }
    } catch (e) { toast(e.message, 'error'); }
}

async function loadEmails(isRefresh) {
    try {
        const data = await api('/emails');
        if (!data.success) throw new Error(data.message);
        const d = data.data;
        const total = d.pagination.total;
        const emails = d.emails || [];

        // Detect new emails on refresh
        if (isRefresh && lastEmailCount > 0 && total > lastEmailCount) {
            newEmailCount = total - lastEmailCount;
            toast(newEmailCount + ' new email' + (newEmailCount > 1 ? 's' : '') + '!', 'success');
        }
        lastEmailCount = total;
        if (!isRefresh) selectedEmails.clear();

        const emailRows = emails.map(e => `
            <tr class="${isRefresh && newEmailCount > 0 ? 'row-new' : ''}">
                <td data-label=""><input type="checkbox" class="bulk-check" data-id="${e.id}" onchange="toggleEmailCheck(${e.id}, this.checked)"></td>
                <td data-label="Email"><span class="status ok">${e.email}</span></td>
                <td data-label="From">${e.from || '-'}</td>
                <td data-label="Subject">${e.subject || '-'}</td>
                <td data-label="Size">${e.size}</td>
                <td data-label="Date">${formatDate(e.date)}</td>
                <td data-label="Actions">
                    <button class="btn-ghost btn-sm" onclick="viewEmail(${e.id})" title="View"><i class="fas fa-eye"></i></button>
                    <button class="btn-ghost btn-sm" onclick="openReply(${e.id})" title="Reply"><i class="fas fa-reply"></i></button>
                    <button class="btn-danger btn-sm" onclick="deleteEmail(${e.id})" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="7" class="empty-state">No emails</td></tr>';

        const newBadge = newEmailCount > 0 ? `<span class="badge-new">${newEmailCount} new</span>` : '';

        document.getElementById('content').innerHTML = `
            <div class="page-header-row">
                <div>
                    <h2 class="page-title" style="margin-bottom:0;">Emails</h2>
                    <p class="page-subtitle" style="margin-bottom:0;">Manage all received emails</p>
                </div>
                <div class="stats-bar" style="margin-bottom:0; padding:8px 14px;">
                    <div class="stats-bar-item">
                        <span class="stats-bar-icon"><i class="fas fa-envelope"></i></span>
                        <span class="stats-bar-value">${total}</span>
                        <span class="stats-bar-label">Total</span>
                    </div>
                    ${newBadge}
                    <button class="btn-ghost btn-sm" onclick="toggleAutoRefresh()" id="btn-refresh-toggle" title="Auto-refresh">
                        <i class="fas fa-sync-alt ${refreshInterval ? 'spin' : ''}"></i>
                    </button>
                </div>
            </div>
            <div id="bulk-bar" class="bulk-bar">
                <input type="checkbox" checked disabled class="bulk-check">
                <span class="bulk-count">0 selected</span>
                <div class="bulk-actions">
                    <button class="btn-danger btn-sm" onclick="bulkDeleteEmails()"><i class="fas fa-trash"></i> Delete Selected</button>
                    <button class="btn-ghost btn-sm" onclick="selectedEmails.clear();toggleAllEmails(false);updateBulkBar();">Clear</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3>All Emails</h3>
                    <span class="badge">${total} total</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th><input type="checkbox" class="bulk-check-header" onchange="toggleAllEmails(this.checked)"></th><th>Email</th><th>From</th><th>Subject</th><th>Size</th><th>Date</th><th>Actions</th></tr></thead>
                        <tbody>${emailRows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        if (!isRefresh) {
            document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
        }
    }
}

function toggleAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        newEmailCount = 0;
        toast('Auto-refresh disabled');
    } else {
        refreshInterval = setInterval(() => loadEmails(true), 15000);
        toast('Auto-refresh enabled (15s)');
    }
    // Update button icon
    const btn = document.getElementById('btn-refresh-toggle');
    if (btn) {
        const icon = btn.querySelector('i');
        if (refreshInterval) icon.classList.add('spin');
        else icon.classList.remove('spin');
    }
}

async function viewEmail(id) {
    document.getElementById('email-view-body').innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto;"></div></div>';
    document.getElementById('email-view-subject').textContent = 'Loading...';
    openModal('modal-view-email');

    try {
        const data = await api('/email/' + id);
        if (!data.success) throw new Error(data.message);
        const e = data.data;

        document.getElementById('email-view-subject').textContent = e.subject || '(No Subject)';
        document.getElementById('email-view-from').textContent = e.from || '-';
        document.getElementById('email-view-to').textContent = e.email || '-';
        document.getElementById('email-view-date').textContent = formatDate(e.date);

        const bodyContent = e.html || e.body || '(empty)';
        const attachmentsHtml = (e.attachments && e.attachments.length > 0) ?
            '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"><strong style="font-size:12px;color:var(--text-muted);">ATTACHMENTS</strong><div style="margin-top:6px;">' +
            e.attachments.map(a => `<span class="status ok" style="margin-right:6px;">${a.filename || 'file'}</span>`).join('') +
            '</div></div>' : '';

        const repliesHtml = (e.replies && e.replies.length > 0) ?
            '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);"><strong style="font-size:12px;color:var(--text-muted);">REPLIES (' + e.replies.length + ')</strong>' +
            e.replies.map(r => `
                <div style="margin-top:8px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);">
                    <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">To: ${r.to} | ${formatDate(r.sentAt)} | <span class="status ${r.status === 'sent' ? 'ok' : 'error'}">${r.status}</span></div>
                    <div style="font-size:13px;white-space:pre-wrap;">${r.body}</div>
                </div>
            `).join('') + '</div>' : '';

        document.getElementById('email-view-body').innerHTML = `
            <div style="margin-bottom:12px;">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;"><strong>From:</strong> ${e.from || '-'}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;"><strong>To:</strong> ${e.email || '-'}</div>
                <div style="font-size:12px;color:var(--text-muted);"><strong>Date:</strong> ${formatDate(e.date)}</div>
            </div>
            ${attachmentsHtml}
            <div style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);margin-top:12px;font-size:13px;line-height:1.7;white-space:pre-wrap;max-height:400px;overflow-y:auto;">${bodyContent}</div>
            ${repliesHtml}
            <div style="margin-top:16px;display:flex;gap:8px;">
                <button class="btn-primary" onclick="closeModal('modal-view-email');openReply(${e.id});"><i class="fas fa-reply"></i> Reply</button>
                <button class="btn-danger" onclick="closeModal('modal-view-email');deleteEmail(${e.id});"><i class="fas fa-trash"></i> Delete</button>
            </div>
        `;
    } catch (e) {
        document.getElementById('email-view-body').innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>';
    }
}

async function openReply(id) {
    currentReplyEmailId = id;
    document.getElementById('reply-body').value = '';
    document.getElementById('reply-subject').value = '';
    document.getElementById('reply-to').textContent = 'Loading...';
    openModal('modal-reply');

    try {
        const data = await api('/email/' + id);
        if (!data.success) throw new Error(data.message);
        const e = data.data;
        document.getElementById('reply-to').textContent = e.from || '-';
        document.getElementById('reply-subject').value = 'Re: ' + (e.subject || '(No Subject)');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function sendReply() {
    if (!currentReplyEmailId) return;
    const body = document.getElementById('reply-body').value.trim();
    const subject = document.getElementById('reply-subject').value.trim();
    if (!body) { toast('Reply body cannot be empty', 'error'); return; }

    const btn = document.getElementById('btn-send-reply');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin:0 auto;"></div>';

    try {
        const data = await api('/reply', {
            method: 'POST',
            body: JSON.stringify({ emailId: currentReplyEmailId, body, subject })
        });
        if (data.success) {
            toast('Reply sent!');
            closeModal('modal-reply');
            loadEmails();
        } else {
            toast(data.message || 'Failed to send reply', 'error');
        }
    } catch (e) {
        toast(e.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Send Reply';
}

async function deleteEmail(id) {
    if (!confirm('Delete this email?')) return;
    try {
        const data = await api('/email/' + id, { method: 'DELETE' });
        if (data.success) { toast('Email deleted'); selectedEmails.delete(id); loadEmails(); }
        else { toast(data.message || 'Failed', 'error'); }
    } catch (e) { toast(e.message, 'error'); }
}

loadEmails(false);
