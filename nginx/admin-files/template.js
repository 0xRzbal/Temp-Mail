// JoeMail Admin - Sidebar Template (v2 - clean URLs)
function renderSidebar(activePage) {
    return `
    <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
            <div class="logo-icon">J</div>
            <div>
                <h1>JoeMail</h1>
                <p>Admin Console</p>
            </div>
        </div>
        <nav class="sidebar-nav">
            <div class="nav-group">
                <div class="nav-label">Main</div>
                <a class="nav-item ${activePage === 'dashboard' ? 'active' : ''}" data-page="dashboard" href="/admin/dashboard">
                    <i class="fas fa-chart-pie"></i><span>Dashboard</span>
                </a>
                <a class="nav-item ${activePage === 'emails' ? 'active' : ''}" data-page="emails" href="/admin/emails">
                    <i class="fas fa-envelope"></i><span>Emails</span>
                </a>
                <a class="nav-item ${activePage === 'addresses' ? 'active' : ''}" data-page="addresses" href="/admin/addresses">
                    <i class="fas fa-at"></i><span>Addresses</span>
                </a>
                <a class="nav-item ${activePage === 'domains' ? 'active' : ''}" data-page="domains" href="/admin/domains">
                    <i class="fas fa-globe"></i><span>Domains</span>
                </a>
            </div>

        </nav>
        <div class="sidebar-footer">
            <button class="nav-item" onclick="doLogout()"><i class="fas fa-sign-out-alt"></i><span>Logout</span></button>
        </div>
    </aside>`;
}

function renderHeader(title) {
    return `
    <header class="app-header">
        <div class="header-left">
            <button class="mobile-toggle" onclick="toggleSidebar()"><i class="fas fa-bars"></i></button>
            <span class="header-title">${title}</span>
        </div>
        <div class="header-right">
            <div class="header-badge"><span class="dot"></span><span>Online</span></div>
            <button class="btn-ghost" onclick="window.open('/', '_blank')"><i class="fas fa-external-link-alt"></i> <span>Frontend</span></button>
        </div>
    </header>`;
}

function renderPageHead(title) {
    return `
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>JoeMail Admin - ${title}</title>
        <link rel="icon" href="/images/logo.svg" type="image/svg+xml">
        <link rel="preconnect" href="https://fonts.bunny.net">
        <link href="https://fonts.bunny.net/css2?family=Kadwa:wght@400;600;700&display=swap" rel="stylesheet">
        <link href="https://fonts.bunny.net/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
        <link rel="stylesheet" href="/admin/admin.css?v=3">
    </head>`;
}
