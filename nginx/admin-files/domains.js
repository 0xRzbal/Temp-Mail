// JoeMail Admin - Domains Page v2
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

fetchServerIP();

var cachedDKIM = {};

async function fetchDKIM(domain) {
    if (cachedDKIM[domain]) return cachedDKIM[domain];
    try {
        const data = await api('/dkim/' + encodeURIComponent(domain));
        if (data.success && data.data && data.data.dkim) {
            cachedDKIM[domain] = data.data.dkim;
            return data.data.dkim;
        }
    } catch {}
    return 'v=DKIM1; h=sha256; k=rsa; p=<DKIM key not generated yet>';
}

async function dnsRecordsHTML(domain, vr) {
    const dkim = await fetchDKIM(domain);
    const records = [
        { num: 1, label: 'Domain Verification', type: 'TXT', name: domain, value: vr, copyValue: 'Type: TXT\nName: ' + domain + '\nValue: ' + vr },
        { num: 2, label: 'Mail Exchange', type: 'MX', name: '@', value: 'mail.' + domain + ' (Priority: 10)', copyValue: 'Type: MX\nName: @\nValue: mail.' + domain + '\nPriority: 10' },
        { num: 3, label: 'Mail Server IP', type: 'A', name: 'mail.' + domain, value: serverIP, copyValue: 'Type: A\nName: mail.' + domain + '\nValue: ' + serverIP },
        { num: 4, label: 'SPF Record', type: 'TXT', name: domain, value: 'v=spf1 mx a ip4:' + serverIP + ' ~all', copyValue: 'Type: TXT\nName: ' + domain + '\nValue: v=spf1 mx a ip4:' + serverIP + ' ~all' },
        { num: 5, label: 'DKIM', type: 'TXT', name: 'mail._domainkey.' + domain, value: dkim, copyValue: 'Type: TXT\nName: mail._domainkey.' + domain + '\nValue: ' + dkim },
        { num: 6, label: 'DMARC', type: 'TXT', name: '_dmarc.' + domain, value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain, copyValue: 'Type: TXT\nName: _dmarc.' + domain + '\nValue: v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain }
    ];

    return records.map(r => `
        <div class="dns-record-card" style="padding:10px 12px;margin-bottom:6px;">
            <div class="dns-header" style="margin-bottom:6px;">
                <span class="dns-num">${r.num}. ${r.label}</span>
                <button class="copy-btn" onclick="copyDNS(this)" data-value="${r.copyValue.replace(/"/g, '&quot;')}"><i class="fas fa-copy"></i> Copy</button>
            </div>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Type: <span class="dns-record-type">${r.type}</span> &middot; Name: <span class="dns-record-name">${r.name}</span></div>
            <div class="dns-row" style="margin-bottom:0;"><span class="label">Value:</span> <span class="dns-record-value" style="word-break:break-all;max-height:60px;overflow-y:auto;display:block;font-size:11px;">${r.value}</span></div>
        </div>
    `).join('');
}


async function checkDomainHealth(domain) {
    const detailDiv = document.getElementById('domain-detail-content');
    if (!detailDiv) return;
    
    // Add health section after existing content
    const existingHealth = document.getElementById('health-check-results');
    if (existingHealth) existingHealth.remove();
    
    const healthDiv = document.createElement('div');
    healthDiv.id = 'health-check-results';
    healthDiv.style.marginTop = '16px';
    healthDiv.innerHTML = '<h3 style="font-size:14px;margin-bottom:12px;">DNS Health Check</h3><div class="empty-state"><div class="spinner" style="margin:0 auto;"></div></div>';
    detailDiv.appendChild(healthDiv);
    
    try {
        const data = await api('/domains/' + encodeURIComponent(domain) + '/health');
        if (!data.success) throw new Error(data.message);
        const h = data.data;
        
        const checkItems = [
            { key: 'mx', label: 'MX Record', desc: 'Mail exchange server' },
            { key: 'spf', label: 'SPF Record', desc: 'Sender policy framework' },
            { key: 'dkim', label: 'DKIM', desc: 'DomainKeys Identified Mail' },
            { key: 'dmarc', label: 'DMARC', desc: 'Domain-based message auth' },
            { key: 'a', label: 'A Record (mail)', desc: 'Mail server IP address' }
        ];
        
        const checksHTML = checkItems.map(item => {
            const check = h.checks[item.key];
            const statusClass = check.status === 'ok' ? 'ok' : check.status === 'warning' ? 'warning' : 'error';
            const statusIcon = check.status === 'ok' ? 'fa-check-circle' : check.status === 'warning' ? 'fa-exclamation-triangle' : 'fa-times-circle';
            const statusText = check.status === 'ok' ? 'Pass' : check.status === 'warning' ? 'Warning' : 'Fail';
            
            let detail = '';
            if (check.records && check.records.length > 0) {
                if (item.key === 'mx') {
                    detail = check.records.map(r => r.exchange + ' (pri:' + r.priority + ')').join(', ');
                } else {
                    detail = check.records[0].substring(0, 60) + (check.records[0].length > 60 ? '...' : '');
                }
            } else if (check.error) {
                detail = check.error;
            }
            
            return `
                <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);margin-bottom:6px;">
                    <i class="fas ${statusIcon}" style="color:var(--${statusClass === 'ok' ? 'success' : statusClass === 'warning' ? 'warning' : 'danger'});font-size:16px;width:20px;text-align:center;"></i>
                    <div style="flex:1;">
                        <div style="font-size:13px;font-weight:600;">${item.label}</div>
                        <div style="font-size:11px;color:var(--text-muted);">${detail || item.desc}</div>
                    </div>
                    <span class="status ${statusClass}">${statusText}</span>
                </div>
            `;
        }).join('');
        
        const overallClass = h.overall === 'ok' ? 'ok' : h.overall === 'warning' ? 'warning' : 'error';
        const overallText = h.overall === 'ok' ? 'All checks passed' : h.overall === 'warning' ? 'Some warnings detected' : 'Issues found';
        
        healthDiv.innerHTML = `
            <h3 style="font-size:14px;margin-bottom:12px;">DNS Health Check</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-xs);">
                <span class="status ${overallClass}">${overallText}</span>
            </div>
            ${checksHTML}
        `;
    } catch (e) {
        healthDiv.innerHTML = '<h3 style="font-size:14px;margin-bottom:12px;">DNS Health Check</h3><div class="empty-state"><p>' + e.message + '</p></div>';
    }
}

async function loadDomains() {
    try {
        const data = await api('/domains');
        if (!data.success) throw new Error(data.message);
        const d = data.data;

        const domainRows = (d.domains || []).map(dm => `
            <tr>
                <td data-label="Domain">${dm.domain}</td>
                <td data-label="Status"><span class="status ${dm.isVerified ? 'ok' : 'warning'}">${dm.isVerified ? 'Verified' : 'Pending'}</span></td>
                <td data-label="Emails">${dm.emailCount || 0}</td>
                <td data-label="Created">${formatDate(dm.createdAt)}</td>
                <td data-label="Actions">
                    <button class="btn-ghost btn-sm" onclick="viewDomain('${dm.domain}')" title="View DNS"><i class="fas fa-eye"></i></button>
                    ${!dm.isVerified ? `<button class="btn-primary btn-sm" onclick="verifyDomain('${dm.domain}')" title="Verify"><i class="fas fa-check"></i></button>` : ''}
                    ${dm.id !== null ? `<button class="btn-danger btn-sm" onclick="deleteDomain('${dm.domain}')" title="Delete"><i class="fas fa-trash"></i></button>` : '<span style="font-size:11px;opacity:0.5;">Built-in</span>'}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="5" class="empty-state">No domains configured. Click "Add Domain" to start.</td></tr>';

        document.getElementById('content').innerHTML = `
            <div class="page-header-row">
                <div>
                    <h2 class="page-title" style="margin-bottom:0;">Domains</h2>
                    <p class="page-subtitle" style="margin-bottom:0;">Manage your mail domains</p>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="stats-bar" style="margin-bottom:0; padding:8px 14px;">
                        <div class="stats-bar-item">
                            <span class="stats-bar-icon"><i class="fas fa-globe"></i></span>
                            <span class="stats-bar-value">${(d.domains || []).length}</span>
                            <span class="stats-bar-label">Domains</span>
                        </div>
                    </div>
                    <button class="btn-primary" onclick="openModal('modal-add-domain')"><i class="fas fa-plus"></i> Add Domain</button>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h3>All Domains</h3>
                    <span class="badge">${(d.domains || []).length} domains</span>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>Domain</th><th>Status</th><th>Emails</th><th>Created</th><th>Actions</th></tr></thead>
                        <tbody>${domainRows}</tbody>
                    </table>
                </div>
            </div>`;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

async function addDomain() {
    const domainInput = document.getElementById('new-domain');
    const domain = domainInput.value.trim().toLowerCase();
    const dnsDiv = document.getElementById('dns-instructions');
    const btn = document.getElementById('btn-add-domain');

    if (!domain) { toast('Enter a domain name', 'error'); return; }
    if (!domain.includes('.')) { toast('Enter a valid domain (e.g. example.com)', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;margin:0 auto;"></div>';

    try {
        const data = await api('/domains', {
            method: 'POST',
            body: JSON.stringify({ domain })
        });

        if (data.success && data.data) {
            const vr = data.data.verificationToken || 'pending';
            dnsDiv.style.display = 'block';
            document.getElementById('dns-records-list').innerHTML = await dnsRecordsHTML(domain, vr);
            btn.textContent = 'Verify & Save';
            btn.disabled = false;
            btn.onclick = () => verifyDomain(domain);
            toast('Domain added. Set DNS records then verify.');
        } else {
            toast(data.message || 'Failed to add domain', 'error');
            btn.disabled = false;
            btn.textContent = 'Add Domain';
        }
    } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Add Domain';
    }
}

async function provisionDomain(domain) {
    try {
        toast('Provisioning mail.' + domain + '...');
        const res = await fetch('/api/provisioner/provision-domain', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain })
        });
        const data = await res.json();
        if (data.success) {
            toast('mail.' + domain + ' provisioned with SSL!');
        } else {
            toast('Provisioning warning: ' + (data.message || 'unknown'), 'error');
        }
    } catch (e) {
        toast('Provisioning failed: ' + e.message, 'error');
    }
}

async function verifyDomain(domain) {
    try {
        const data = await api('/domains/' + encodeURIComponent(domain) + '/verify', { method: 'POST' });
        if (data.success) {
            toast('Domain verified and activated!');
            closeModal('modal-add-domain');
            resetAddDomainModal();
            loadDomains();
            // Auto-provision nginx + SSL for mail.<domain>
            await provisionDomain(domain);
        } else {
            toast(data.message || 'Verification failed', 'error');
        }
    } catch (e) {
        toast(e.message, 'error');
    }
}

function resetAddDomainModal() {
    document.getElementById('new-domain').value = '';
    document.getElementById('dns-instructions').style.display = 'none';
    document.getElementById('dns-records-list').innerHTML = '';
    const btn = document.getElementById('btn-add-domain');
    btn.textContent = 'Add Domain';
    btn.disabled = false;
    btn.onclick = addDomain;
}

async function viewDomain(domain) {
    document.getElementById('detail-domain-name').textContent = domain;
    document.getElementById('domain-detail-content').innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto;"></div></div>';
    openModal('modal-domain-detail');

    try {
        const data = await api('/domains');
        if (!data.success) throw new Error(data.message);
        const dm = (data.data.domains || []).find(d => d.domain === domain);
        if (!dm) throw new Error('Domain not found');

        const dnsHTML = await dnsRecordsHTML(domain, dm.verificationToken || 'N/A');
        document.getElementById('domain-detail-content').innerHTML = `
            <div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span class="status ${dm.isVerified ? 'ok' : 'warning'}">${dm.isVerified ? 'Verified' : 'Pending Verification'}</span>
                <span style="color:var(--text-muted);font-size:12px;">${dm.emailCount || 0} emails</span>
                <button class="btn-primary btn-sm" onclick="checkDomainHealth('${domain}')" style="margin-left:auto;"><i class="fas fa-heartbeat"></i> Health Check</button>
            </div>
            <h3 style="font-size:14px;margin-bottom:12px;">Required DNS Records</h3>
            ${dnsHTML}
        `;
    } catch (e) {
        document.getElementById('domain-detail-content').innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>';
    }
}

async function deleteDomain(domain) {
    if (!confirm('Permanently delete "' + domain + '"? This removes it from the database.')) return;
    try {
        const data = await api('/domains/' + encodeURIComponent(domain), { method: 'DELETE' });
        if (data.success) { toast('Domain deleted'); loadDomains(); }
        else { toast(data.message || 'Failed', 'error'); }
    } catch (e) { toast(e.message, 'error'); }
}

loadDomains();