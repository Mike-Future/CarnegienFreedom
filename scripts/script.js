// CarnegienFreedom.cc - Main JavaScript
const COOKIE_CONSENT_KEY = 'legitways_cookie_consent';

function getCookieConsent() {
    try {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (error) {
        return null;
    }
}

function hasAnalyticsConsent() {
    const consent = getCookieConsent();
    return Boolean(consent && consent.analytics === true);
}

function saveCookieConsent(choice) {
    const consent = {
        choice,
        analytics: choice === 'all',
        marketing: choice === 'all',
        timestamp: new Date().toISOString()
    };

    try {
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    } catch (error) {
        console.warn('Cookie consent could not be saved:', error);
    }

    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    if (banner) banner.classList.remove('visible');
    if (modal) modal.classList.remove('visible');
}

function updateConsentTogglesFromStorage() {
    const analyticsToggle = document.getElementById('analyticsCookieToggle');
    const marketingToggle = document.getElementById('marketingCookieToggle');
    if (!analyticsToggle || !marketingToggle) return;

    const consent = getCookieConsent();
    if (!consent) {
        analyticsToggle.checked = false;
        marketingToggle.checked = false;
        return;
    }

    analyticsToggle.checked = Boolean(consent.analytics);
    marketingToggle.checked = Boolean(consent.marketing);
}

function applyConsentChoice(choice, options = {}) {
    const analyticsCookieEnabled = choice === 'reject'
        ? false
        : (options.analytics ?? choice === 'all');
    const marketingCookieEnabled = choice === 'reject'
        ? false
        : (options.marketing ?? choice === 'all');

    const consent = {
        choice,
        analytics: analyticsCookieEnabled,
        marketing: marketingCookieEnabled,
        timestamp: new Date().toISOString()
    };

    try {
        localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent));
    } catch (error) {
        console.warn('Cookie consent could not be saved:', error);
    }

    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    if (banner) banner.classList.remove('visible');
    if (modal) modal.classList.remove('visible');
}

function openCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (!modal) return;
    updateConsentTogglesFromStorage();
    modal.classList.add('visible');
    modal.setAttribute('aria-hidden', 'false');
}

function closeCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (!modal) return;
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
}

function initializeCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    const modal = document.getElementById('cookieModal');
    const managePrefsButton = document.getElementById('manageCookiePrefs');
    const closeButton = document.getElementById('closeCookieModal');
    const consentButtons = document.querySelectorAll('[data-cookie-choice]');
    const analyticsToggle = document.getElementById('analyticsCookieToggle');
    const marketingToggle = document.getElementById('marketingCookieToggle');

    const consent = getCookieConsent();
    if (!consent) {
        if (banner) banner.classList.add('visible');
    } else {
        if (banner) banner.classList.remove('visible');
    }

    consentButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const choice = button.dataset.cookieChoice;

            if (choice === 'all') {
                applyConsentChoice('all', { analytics: true, marketing: true });
                return;
            }

            if (choice === 'reject') {
                applyConsentChoice('reject', { analytics: false, marketing: false });
                return;
            }

            const analyticsEnabled = analyticsToggle ? analyticsToggle.checked : false;
            const marketingEnabled = marketingToggle ? marketingToggle.checked : false;
            applyConsentChoice('necessary', { analytics: analyticsEnabled, marketing: marketingEnabled });
        });
    });

    if (managePrefsButton) {
        managePrefsButton.addEventListener('click', openCookieModal);
    }

    if (closeButton) {
        closeButton.addEventListener('click', closeCookieModal);
    }

    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeCookieModal();
            }
        });
    }

    if (analyticsToggle) {
        analyticsToggle.checked = Boolean(consent?.analytics);
    }

    if (marketingToggle) {
        marketingToggle.checked = Boolean(consent?.marketing);
    }
}

// Mobile Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (!menu) return;
    menu.classList.toggle('active');
}

// Hidden admin access: Ctrl+Shift+A on Windows/Linux, Cmd+Shift+A on macOS.
document.addEventListener('keydown', (event) => {
    const target = event.target;
    const isFormField = target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

    if (!isFormField && event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        window.location.href = 'admin.html';
    }
});

initializeCookieBanner();

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({
            behavior: prefersReducedMotion ? 'auto' : 'smooth',
            block: 'start'
        });
    });
});

// Scroll Animations using Intersection Observer
if ('IntersectionObserver' in window) {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.fade-in').forEach(el => {
        observer.observe(el);
    });
}

function setGuideDownloadState(button, isLoading) {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.dataset.originalText || button.textContent.trim();
        button.textContent = 'Downloading...';
        button.setAttribute('aria-busy', 'true');
        button.classList.add('is-loading');
        button.style.pointerEvents = 'none';
    } else {
        button.textContent = button.dataset.originalText || 'Get Free Guide';
        button.removeAttribute('aria-busy');
        button.classList.remove('is-loading');
        button.style.pointerEvents = '';
    }
}

function downloadGuide(triggerButton) {
    const fileUrl = 'assets/legit-ways-guide.pdf';
    if (triggerButton) {
        setGuideDownloadState(triggerButton, true);
    }

    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = 'legit-ways-guide.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        if (triggerButton) {
            setGuideDownloadState(triggerButton, false);
        }
    }, 1200);
}

// Form Handler for Lead Magnet
function handleSubmit(e) {
    e.preventDefault();

    const submitButton = e.target.querySelector('button[type="submit"]');
    setGuideDownloadState(submitButton, true);

    downloadGuide(submitButton);

    setTimeout(() => {
        if (e.target.reset) {
            e.target.reset();
        }
    }, 500);
}

// Navbar Scroll Effect
const navbar = document.querySelector('.navbar');
if (navbar) {
    const updateNavbar = () => {
        const scrolled = window.scrollY > 50;
        navbar.style.background = scrolled ? 'rgba(7, 26, 61, 0.98)' : 'rgba(7, 26, 61, 0.95)';
        navbar.style.boxShadow = scrolled ? '0 2px 20px rgba(0,0,0,0.1)' : 'none';
    };

    let ticking = false;
    const onScroll = () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                updateNavbar();
                ticking = false;
            });
            ticking = true;
        }
    };

    updateNavbar();
    window.addEventListener('scroll', onScroll, { passive: true });
}

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.mobile-menu-toggle');

    if (!mobileMenu || !menuToggle) return;

    if (mobileMenu.classList.contains('active') &&
        !mobileMenu.contains(e.target) &&
        !menuToggle.contains(e.target)) {
        mobileMenu.classList.remove('active');
    }
});

// Performance: Lazy load images (if adding more images later)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.removeAttribute('data-src');
                    observer.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Analytics placeholder (replace with your actual analytics)
function trackEvent(eventName, properties) {
    if (!hasAnalyticsConsent()) {
        return;
    }

    // Example: gtag('event', eventName, properties);
    // Example: fbq('track', eventName, properties);
    console.log('Event tracked:', eventName, properties);
}

// Track CTA clicks
document.querySelectorAll('.btn-primary, .btn-secondary, .nav-cta').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const text = btn.textContent.trim();
        trackEvent('cta_click', { button_text: text });
    });
});
