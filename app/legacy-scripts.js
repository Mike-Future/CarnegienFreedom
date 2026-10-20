'use client';

import { useEffect } from 'react';

const scriptsByPage = {
    admin: ['/scripts/db.js', '/scripts/page-content-sections.js', '/scripts/admin.js'],
    home: ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    about: ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'core-values': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    contact: ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'cookie-policy': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    disclaimer: ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'earnings-disclaimer': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'privacy-policy': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'scam-awareness': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'success-stories': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
    'terms-of-use': ['/scripts/page-content-sections.js', '/scripts/page-content.js'],
};

export default function LegacyScripts() {
    useEffect(() => {
        const page = window.location.pathname.split('/').filter(Boolean).pop() || 'home';
        const scripts = scriptsByPage[page];
        if (!scripts) return undefined;

        let cancelled = false;
        const loadScripts = async () => {
            for (const source of scripts) {
                if (cancelled) return;
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = `${source}?v=20261020-page-sections`;
                    script.onload = resolve;
                    script.onerror = reject;
                    document.body.appendChild(script);
                });
            }
            document.dispatchEvent(new Event('DOMContentLoaded'));
        };

        loadScripts().catch((error) => console.error('Unable to load page script:', error));
        return () => { cancelled = true; };
    }, []);

    return null;
}
