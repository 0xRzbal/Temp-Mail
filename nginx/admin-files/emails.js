// JoeMail Admin - Emails v6 with Compose + Sent/Received tabs
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

var currentReplyEmailId = null;
var selectedEmails = new Set();
var lastEmailCount = 0;
var refreshInterval = null;
var currentTab = 'received';

// ===== TAB SWITCHING =====
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="' + tab + '"]').classList.add('active');
    if (tab === 'received') loadEmails(false);
    else loadSent();
}

// ===== COMPOSE =====
async function openCompose() {
    document.getElementById('compose-to').value = '';
    document.getElementById('compose-subject').value = '';
    document.getElementById('compose-body').value = '';
    document.getElementById('compose-from').value = '';
    openModal('modal-compose');
    document.getElementById('compose-from').focus();
    // Load addresses for From datalist suggestions
    try {
        var data = await api('/users');
        var datalist = document.getElementById('from-suggestions');
        datalist.innerHTML = '';
        if (data.success && data.data && data.data.users) {
            data.data.users.forEach(function(u) {
                var opt = document.createElement('option');
                opt.value = u.email;
                datalist.appendChild(opt);
            });
        }
    } catch (e) { /* ignore */ }
}

async function sendCompose() {
    var from = document.getElementById('compose-from').value.trim();
    var toRaw = document.getElementById('compose-to').value.trim();
    var subject = document.getElementById('compose-subject').value.trim();
    var body = document.getElementById('compose-body').value.trim();
    if (!from) { toast('From address required', 'error'); return; }
    if (!toRaw) { toast('Recipient required', 'error'); return; }
    if (!body) { toast('Message body required', 'error'); return; }

    // Parse multiple recipients (comma-separated)
    var recipients = toRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    if (recipients.length === 0) { toast('No valid recipients', 'error'); return; }

    var btn = document.getElementById('btn-send-compose');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin:0 auto;"></div>';

    var successCount = 0;
    var failCount = 0;

    try {
        for (var i = 0; i < recipients.length; i++) {
            var data = await api('/compose', {
                method: 'POST',
                body: JSON.stringify({ from: from, to: recipients[i], subject: subject, body: body })
            });
            if (data.success) successCount++;
            else failCount++;
        }
        if (successCount > 0) toast('Sent to ' + successCount + ' recipient(s)' + (failCount > 0 ? ', ' + failCount + ' failed' : ''));
        if (failCount > 0 && successCount === 0) toast('Failed to send to all recipients', 'error');
        closeModal('modal-compose');
        if (currentTab === 'sent') loadSent();
    } catch (e) {
        toast(e.message, 'error');
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send';
}

// ===== RECEIVED EMAILS =====
function toggleEmailCheck(id, checked) {
    if (checked) selectedEmails.add(id); else selectedEmails.delete(id);
    updateBulkBar();
}

function toggleAllEmails(checked) {
    document.querySelectorAll('.bulk-check').forEach(function(cb) {
        cb.checked = checked;
        var id = parseInt(cb.dataset.id);
        if (checked) selectedEmails.add(id); else selectedEmails.delete(id);
    });
    updateBulkBar();
}

function updateBulkBar() {
    var bar = document.getElementById('bulk-bar');
    if (!bar) return;
    var count = selectedEmails.size;
    if (count > 0) {
        bar.classList.add('show');
        bar.querySelector('.bulk-count').textContent = count + ' selected';
    } else {
        bar.classList.remove('show');
    }
}

async function bulkDeleteEmails() {
    var count = selectedEmails.size;
    if (count === 0) return;
    if (!confirm('Delete ' + count + ' emails?')) return;
    try {
        var data = await api('/emails/bulk-delete', {
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
        var data = await api('/emails');
        if (!data.success) throw new Error(data.message);
        var d = data.data;
        var total = d.pagination.total;
        var emails = d.emails || [];

        if (isRefresh && lastEmailCount > 0 && total > lastEmailCount) {
            toast((total - lastEmailCount) + ' new email(s)!');
        }
        lastEmailCount = total;
        if (!isRefresh) selectedEmails.clear();

        var emailRows = emails.map(function(e) {
            return '<tr>' +
                '<td><input type="checkbox" class="bulk-check" data-id="' + e.id + '" onchange="toggleEmailCheck(' + e.id + ', this.checked)"></td>' +
                '<td><span class="status ok">' + e.email + '</span></td>' +
                '<td>' + (e.from || '-') + '</td>' +
                '<td>' + (e.subject || '-') + '</td>' +
                '<td>' + (e.size || '-') + '</td>' +
                '<td>' + formatDate(e.date) + '</td>' +
                '<td>' +
                    '<button class="btn-ghost btn-sm" onclick="viewEmail(' + e.id + ')" title="View"><i class="fas fa-eye"></i></button> ' +
                    '<button class="btn-ghost btn-sm" onclick="openReply(' + e.id + ')" title="Reply"><i class="fas fa-reply"></i></button> ' +
                    '<button class="btn-danger btn-sm" onclick="deleteEmail(' + e.id + ')" title="Delete"><i class="fas fa-trash"></i></button>' +
                '</td></tr>';
        }).join('') || '<tr><td colspan="7" class="empty-state">No received emails</td></tr>';

        document.getElementById('content').innerHTML =
            '<div class="page-header-row">' +
                '<div>' +
                    '<h2 class="page-title" style="margin-bottom:0;">Emails</h2>' +
                    '<p class="page-subtitle" style="margin-bottom:0;">Manage all emails</p>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;">' +
                    '<button class="btn-primary" onclick="openCompose()"><i class="fas fa-pen"></i> Compose</button>' +
                    '<button class="btn-ghost btn-sm" onclick="toggleAutoRefresh()" id="btn-refresh-toggle" title="Auto-refresh">' +
                        '<i class="fas fa-sync-alt' + (refreshInterval ? ' spin' : '') + '"></i>' +
                    '</button>' +
                '</div>' +
            '</div>' +
            '<div class="tabs-row">' +
                '<button class="tab-btn active" data-tab="received" onclick="switchTab(\'received\')"><i class="fas fa-inbox"></i> Received (' + total + ')</button>' +
                '<button class="tab-btn" data-tab="sent" onclick="switchTab(\'sent\')"><i class="fas fa-paper-plane"></i> Sent</button>' +
            '</div>' +
            '<div id="bulk-bar" class="bulk-bar">' +
                '<input type="checkbox" checked disabled class="bulk-check">' +
                '<span class="bulk-count">0 selected</span>' +
                '<div class="bulk-actions">' +
                    '<button class="btn-danger btn-sm" onclick="bulkDeleteEmails()"><i class="fas fa-trash"></i> Delete Selected</button>' +
                    '<button class="btn-ghost btn-sm" onclick="selectedEmails.clear();toggleAllEmails(false);updateBulkBar();">Clear</button>' +
                '</div>' +
            '</div>' +
            '<div class="card">' +
                '<div class="card-header"><h3>Received Emails</h3><span class="badge">' + total + ' total</span></div>' +
                '<div class="table-wrap"><table>' +
                    '<thead><tr><th><input type="checkbox" class="bulk-check-header" onchange="toggleAllEmails(this.checked)"></th><th>Email</th><th>From</th><th>Subject</th><th>Size</th><th>Date</th><th>Actions</th></tr></thead>' +
                    '<tbody>' + emailRows + '</tbody>' +
                '</table></div>' +
            '</div>';
    } catch (e) {
        if (!isRefresh) {
            document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
        }
    }
}

// ===== SENT EMAILS =====
var selectedSent = new Set();

function toggleSentCheck(id, checked) {
    if (checked) selectedSent.add(id); else selectedSent.delete(id);
    updateSentBulkBar();
}

function toggleAllSent(checked) {
    document.querySelectorAll('.sent-check').forEach(function(cb) {
        cb.checked = checked;
        var id = parseInt(cb.dataset.id);
        if (checked) selectedSent.add(id); else selectedSent.delete(id);
    });
    updateSentBulkBar();
}

function updateSentBulkBar() {
    var bar = document.getElementById('sent-bulk-bar');
    if (!bar) return;
    var count = selectedSent.size;
    if (count > 0) {
        bar.classList.add('show');
        bar.querySelector('.bulk-count').textContent = count + ' selected';
    } else {
        bar.classList.remove('show');
    }
}

async function deleteSentEmail(id) {
    if (!confirm('Delete this sent email?')) return;
    try {
        var data = await api('/sent/' + id, { method: 'DELETE' });
        if (data.success) { toast('Sent email deleted'); selectedSent.delete(id); loadSent(); }
        else { toast(data.message || 'Failed', 'error'); }
    } catch (e) { toast(e.message, 'error'); }
}

async function bulkDeleteSent() {
    var count = selectedSent.size;
    if (count === 0) return;
    if (!confirm('Delete ' + count + ' sent emails?')) return;
    try {
        var data = await api('/sent/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids: Array.from(selectedSent) })
        });
        if (data.success) {
            toast(count + ' sent emails deleted');
            selectedSent.clear();
            loadSent();
        } else {
            toast(data.message || 'Failed', 'error');
        }
    } catch (e) { toast(e.message, 'error'); }
}

async function loadSent() {
    try {
        var data = await api('/sent');
        if (!data.success) throw new Error(data.message);
        var emails = data.data.emails || [];
        selectedSent.clear();

        var rows = emails.map(function(e) {
            var statusClass = e.status === 'sent' ? 'ok' : 'error';
            return '<tr>' +
                '<td><input type="checkbox" class="sent-check" data-id="' + e.id + '" onchange="toggleSentCheck(' + e.id + ', this.checked)"></td>' +
                '<td>' + (e.to || '-') + '</td>' +
                '<td>' + (e.from || '-') + '</td>' +
                '<td>' + (e.subject || '-') + '</td>' +
                '<td>' + formatDate(e.date) + '</td>' +
                '<td><span class="status ' + statusClass + '">' + (e.status || '-') + '</span></td>' +
                '<td><button class="btn-danger btn-sm" onclick="deleteSentEmail(' + e.id + ')" title="Delete"><i class="fas fa-trash"></i></button></td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="7" class="empty-state">No sent emails</td></tr>';

        document.getElementById('content').innerHTML =
            '<div class="page-header-row">' +
                '<div>' +
                    '<h2 class="page-title" style="margin-bottom:0;">Emails</h2>' +
                    '<p class="page-subtitle" style="margin-bottom:0;">Manage all emails</p>' +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;">' +
                    '<button class="btn-primary" onclick="openCompose()"><i class="fas fa-pen"></i> Compose</button>' +
                '</div>' +
            '</div>' +
            '<div class="tabs-row">' +
                '<button class="tab-btn" data-tab="received" onclick="switchTab(\'received\')"><i class="fas fa-inbox"></i> Received</button>' +
                '<button class="tab-btn active" data-tab="sent" onclick="switchTab(\'sent\')"><i class="fas fa-paper-plane"></i> Sent (' + emails.length + ')</button>' +
            '</div>' +
            '<div id="sent-bulk-bar" class="bulk-bar">' +
                '<input type="checkbox" checked disabled class="bulk-check">' +
                '<span class="bulk-count">0 selected</span>' +
                '<div class="bulk-actions">' +
                    '<button class="btn-danger btn-sm" onclick="bulkDeleteSent()"><i class="fas fa-trash"></i> Delete Selected</button>' +
                    '<button class="btn-ghost btn-sm" onclick="selectedSent.clear();toggleAllSent(false);updateSentBulkBar();">Clear</button>' +
                '</div>' +
            '</div>' +
            '<div class="card">' +
                '<div class="card-header"><h3>Sent Emails</h3><span class="badge">' + emails.length + ' sent</span></div>' +
                '<div class="table-wrap"><table>' +
                    '<thead><tr><th><input type="checkbox" class="bulk-check-header" onchange="toggleAllSent(this.checked)"></th><th>To</th><th>From</th><th>Subject</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table></div>' +
            '</div>';
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

// ===== AUTO REFRESH =====
function toggleAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        toast('Auto-refresh disabled');
    } else {
        refreshInterval = setInterval(function() { if (currentTab === 'received') loadEmails(true); }, 15000);
        toast('Auto-refresh enabled (15s)');
    }
    var btn = document.getElementById('btn-refresh-toggle');
    if (btn) {
        var icon = btn.querySelector('i');
        if (refreshInterval) icon.classList.add('spin');
        else icon.classList.remove('spin');
    }
}

// ===== VIEW EMAIL =====
async function viewEmail(id) {
    document.getElementById('email-view-body').innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto;"></div></div>';
    document.getElementById('email-view-subject').textContent = 'Loading...';
    document.getElementById('email-view-meta').innerHTML = '';
    openModal('modal-view-email');

    try {
        var data = await api('/email/' + id);
        if (!data.success) throw new Error(data.message);
        var e = data.data;

        document.getElementById('email-view-subject').textContent = e.subject || '(No Subject)';
        document.getElementById('email-view-meta').innerHTML =
            '<div style="font-size:12px;color:var(--text-muted);"><strong>From:</strong> ' + (e.from || '-') + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);"><strong>To:</strong> ' + (e.email || '-') + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);"><strong>Date:</strong> ' + formatDate(e.date) + '</div>';

        var bodyContent = e.html || e.body || '(empty)';
        var attachmentsHtml = '';
        if (e.attachments && e.attachments.length > 0) {
            attachmentsHtml = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
                '<strong style="font-size:12px;color:var(--text-muted);">ATTACHMENTS</strong><div style="margin-top:6px;">' +
                e.attachments.map(function(a) { return '<span class="status ok" style="margin-right:6px;">' + (a.filename || 'file') + '</span>'; }).join('') +
                '</div></div>';
        }

        var repliesHtml = '';
        if (e.replies && e.replies.length > 0) {
            repliesHtml = '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);">' +
                '<strong style="font-size:12px;color:var(--text-muted);">REPLIES (' + e.replies.length + ')</strong>' +
                e.replies.map(function(r) {
                    return '<div style="margin-top:8px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);">' +
                        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">To: ' + r.to + ' | ' + formatDate(r.sentAt) + ' | <span class="status ' + (r.status === 'sent' ? 'ok' : 'error') + '">' + r.status + '</span></div>' +
                        '<div style="font-size:13px;white-space:pre-wrap;">' + r.body + '</div></div>';
                }).join('') + '</div>';
        }

        document.getElementById('email-view-body').innerHTML =
            attachmentsHtml +
            '<div style="padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);margin-top:12px;font-size:13px;line-height:1.7;white-space:pre-wrap;max-height:400px;overflow-y:auto;">' + bodyContent + '</div>' +
            repliesHtml +
            '<div style="margin-top:16px;display:flex;gap:8px;">' +
                '<button class="btn-primary" onclick="closeModal(\'modal-view-email\');openReply(' + e.id + ');"><i class="fas fa-reply"></i> Reply</button>' +
                '<button class="btn-danger" onclick="closeModal(\'modal-view-email\');deleteEmail(' + e.id + ');"><i class="fas fa-trash"></i> Delete</button>' +
            '</div>';
    } catch (e) {
        document.getElementById('email-view-body').innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>';
    }
}

// ===== REPLY =====
async function openReply(id) {
    currentReplyEmailId = id;
    document.getElementById('reply-body').value = '';
    document.getElementById('reply-subject').value = '';
    document.getElementById('reply-from').value = '';
    document.getElementById('reply-to').textContent = 'Loading...';
    openModal('modal-reply');

    // Load addresses for From datalist
    try {
        var usersData = await api('/users');
        var datalist = document.getElementById('reply-from-suggestions');
        datalist.innerHTML = '';
        if (usersData.success && usersData.data && usersData.data.users) {
            usersData.data.users.forEach(function(u) {
                var opt = document.createElement('option');
                opt.value = u.email;
                datalist.appendChild(opt);
            });
        }
    } catch (e) { /* ignore */ }

    try {
        var data = await api('/email/' + id);
        if (!data.success) throw new Error(data.message);
        var e = data.data;
        document.getElementById('reply-to').textContent = e.from || '-';
        document.getElementById('reply-subject').value = 'Re: ' + (e.subject || '(No Subject)');
        // Pre-fill From with the address the email was sent to
        document.getElementById('reply-from').value = e.email || '';
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function sendReply() {
    if (!currentReplyEmailId) return;
    var from = document.getElementById('reply-from').value.trim();
    var body = document.getElementById('reply-body').value.trim();
    var subject = document.getElementById('reply-subject').value.trim();
    if (!from) { toast('From address required', 'error'); return; }
    if (!body) { toast('Reply body cannot be empty', 'error'); return; }

    var btn = document.getElementById('btn-send-reply');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin:0 auto;"></div>';

    try {
        var data = await api('/reply', {
            method: 'POST',
            body: JSON.stringify({ emailId: currentReplyEmailId, from: from, body: body, subject: subject })
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

// ===== DELETE =====
async function deleteEmail(id) {
    if (!confirm('Delete this email?')) return;
    try {
        var data = await api('/email/' + id, { method: 'DELETE' });
        if (data.success) { toast('Email deleted'); selectedEmails.delete(id); loadEmails(); }
        else { toast(data.message || 'Failed', 'error'); }
    } catch (e) { toast(e.message, 'error'); }
}

// ===== INIT =====
loadEmails(false);
