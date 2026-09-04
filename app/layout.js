import Script from 'next/script';
import LegacyScripts from './legacy-scripts';
import '../styles/style.css';
import '../styles/info-style.css';
import '../styles/blog-style.css';
import '../styles/blog-post-style.css';
import '../styles/admin-style.css';

export const metadata = {
    title: 'CarnegienFreedom | Legit Ways to Live Better, Smarter, and More Securely',
    description: 'Education-first guidance to help you learn what works, avoid scams, and find legitimate paths to better living.',
    icons: { icon: '/images/favicon.svg' },
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>
                {children}
                <Script src="/scripts/script.js" strategy="afterInteractive" />
                <LegacyScripts />
            </body>
        </html>
    );
}
