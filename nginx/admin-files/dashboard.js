// JoeMail Admin - Dashboard v3 - Modern Design
if (typeof requireAuth === 'function' && !requireAuth()) location.href = '/admin/';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
}

function formatUptime(seconds) {
    if (seconds < 60) return seconds + 's';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm';
    if (seconds < 86400) return Math.round(seconds / 3600) + 'h';
    return Math.round(seconds / 86400) + 'd';
}

async function loadDashboard() {
    try {
        const data = await api('/dashboard');
        if (!data.success) throw new Error(data.message);
        const d = data.data;
        const uptime = d.systemHealth?.uptime || 0;
        const memUsage = d.systemHealth?.memory?.used || 0;
        const memTotal = d.systemHealth?.memory?.total || 1;
        const memPercent = d.systemHealth?.memory?.percent || Math.round((memUsage / memTotal) * 100);
        
        // Get current Jakarta time
        const now = new Date();
        const jakartaTime = now.toLocaleString('id-ID', { 
            timeZone: 'Asia/Jakarta', 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
        const jakartaDate = now.toLocaleDateString('id-ID', { 
            timeZone: 'Asia/Jakarta', 
            weekday: 'long',
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
        });

        const recentEmailsHTML = (d.recentEmails || []).slice(0, 5).map(e => `
            <div class="activity-item">
                <div class="activity-icon"><i class="fas fa-envelope"></i></div>
                <div class="activity-content">
                    <div class="activity-title">${e.subject || '(No Subject)'}</div>
                    <div class="activity-meta">${e.email} &middot; ${e.from || 'Unknown'}</div>
                </div>
                <div class="activity-time">${formatDate(e.date)}</div>
            </div>
        `).join('') || '<div class="empty-state" style="padding:20px;"><i class="fas fa-inbox"></i><p>No recent emails</p></div>';

        const recentAddressesHTML = (d.recentAddresses || []).slice(0, 5).map(a => `
            <div class="activity-item">
                <div class="activity-icon address"><i class="fas fa-at"></i></div>
                <div class="activity-content">
                    <div class="activity-title">${a.email}</div>
                    <div class="activity-meta">${a.accessCount || 0} accesses</div>
                </div>
                <div class="activity-time">${formatDate(a.createdAt)}</div>
            </div>
        `).join('') || '<div class="empty-state" style="padding:20px;"><i class="fas fa-user-plus"></i><p>No recent addresses</p></div>';

        document.getElementById('content').innerHTML = `
            <!-- Welcome Section -->
            <div class="dashboard-welcome">
                <div class="welcome-text">
                    <h2 class="welcome-greeting">${getGreeting()}</h2>
                    <p class="welcome-subtitle">Welcome to JoeMail Admin Console</p>
                    <div class="welcome-time">${jakartaTime} WIB &middot; ${jakartaDate}</div>
                </div>
                <div class="welcome-status">
                    <div class="status-pulse"></div>
                    <span>All Systems Operational</span>
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="stats-grid-modern">
                <div class="stat-card-modern">
                    <div class="stat-icon-modern emails"><i class="fas fa-envelope"></i></div>
                    <div class="stat-info">
                        <div class="stat-value-modern">${d.stats.totalEmails || 0}</div>
                        <div class="stat-label-modern">Total Emails</div>
                    </div>
                </div>
                <div class="stat-card-modern">
                    <div class="stat-icon-modern addresses"><i class="fas fa-users"></i></div>
                    <div class="stat-info">
                        <div class="stat-value-modern">${d.stats.totalAddresses || 0}</div>
                        <div class="stat-label-modern">Active Addresses</div>
                    </div>
                </div>
                <div class="stat-card-modern">
                    <div class="stat-icon-modern domains"><i class="fas fa-globe"></i></div>
                    <div class="stat-info">
                        <div class="stat-value-modern">${d.stats.totalDomains || 0}</div>
                        <div class="stat-label-modern">Domains</div>
                    </div>
                </div>
                <div class="stat-card-modern">
                    <div class="stat-icon-modern uptime"><i class="fas fa-clock"></i></div>
                    <div class="stat-info">
                        <div class="stat-value-modern">${formatUptime(uptime)}</div>
                        <div class="stat-label-modern">Uptime</div>
                    </div>
                </div>
            </div>

            <!-- Activity Section -->
            <div class="dashboard-grid">
                <div class="dashboard-section">
                    <div class="section-header">
                        <h3 class="section-title"><i class="fas fa-clock"></i> Recent Emails</h3>
                        <a href="/admin/emails" class="section-link">View All <i class="fas fa-arrow-right"></i></a>
                    </div>
                    <div class="activity-list">${recentEmailsHTML}</div>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h3 class="section-title"><i class="fas fa-user-plus"></i> New Addresses</h3>
                        <a href="/admin/addresses" class="section-link">View All <i class="fas fa-arrow-right"></i></a>
                    </div>
                    <div class="activity-list">${recentAddressesHTML}</div>
                </div>
            </div>

            <!-- System Info -->
            <div class="system-info">
                <div class="system-card">
                    <div class="system-label">Memory Usage</div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${memPercent}%"></div>
                    </div>
                    <div class="system-value">${memPercent}% (${(memUsage/1024/1024).toFixed(0)}MB / ${(memTotal/1024/1024).toFixed(0)}MB)</div>
                </div>
                <div class="system-card">
                    <div class="system-label">API Status</div>
                    <div class="system-value"><span class="status-dot online"></span> Connected</div>
                </div>
                <div class="system-card">
                    <div class="system-label">Database</div>
                    <div class="system-value"><span class="status-dot online"></span> Healthy</div>
                </div>
            </div>
        `;
    } catch (e) {
        document.getElementById('content').innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>' + e.message + '</p></div>';
    }
}

loadDashboard();
