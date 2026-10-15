async function fetchPartial(path) {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) {
        throw new Error(`Unable to load shared layout (${response.status}): ${path}`);
    }
    return response.text();
}

function configureSharedHeader() {
    const page = window.location.pathname.split('/').pop() || 'index.html';
    const logo = document.querySelector('[data-shared-logo]');
    if (page === 'index.html' && logo) logo.href = '#';

    document.querySelectorAll('[data-active-pages]').forEach(link => {
        const pages = link.dataset.activePages.split(' ');
        if (pages.includes(page)) link.classList.add('active');
    });

    document.querySelectorAll('[data-shared-guide-link]').forEach(link => {
        if (page === 'index.html') {
            link.href = '#';
            link.dataset.guideButton = link.closest('#mobileMenu') ? 'mobile' : 'top';
            link.textContent = 'Download Guide';
        }
    });
}

function loadScript(path) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${path}?v=20261014`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Unable to load page script: ${path}`));
        document.body.append(script);
    });
}

try {
    const headerTarget = document.querySelector('[data-shared-header]');
    const footerTarget = document.querySelector('[data-shared-footer]');
    if (!headerTarget || !footerTarget) {
        throw new Error('Shared header or footer placeholder is missing.');
    }

    const [header, footer] = await Promise.all([
        fetchPartial('../partials/header.html?v=20261014-clickable-social'),
        fetchPartial('../partials/footer.html?v=20261014-clickable-social')
    ]);
    headerTarget.outerHTML = header;
    footerTarget.outerHTML = footer;
    configureSharedHeader();

    const pageScripts = document.body.dataset.sharedScripts.trim().split(/\s+/).filter(Boolean);
    for (const path of pageScripts) {
        await loadScript(path);
    }
} catch (error) {
    console.error('Shared page layout failed to initialize:', error);
}