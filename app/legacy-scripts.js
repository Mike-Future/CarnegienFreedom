'use client';

import { useEffect } from 'react';

const scriptsByPage = {
    admin: ['/scripts/db.js', '/scripts/admin.js'],
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
                    script.src = source;
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
