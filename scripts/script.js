// LegitWays.cc - Main JavaScript
// Mobile Menu Toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
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

// Smooth Scroll for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Scroll Animations using Intersection Observer
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

// Observe all elements with fade-in class
document.querySelectorAll('.fade-in').forEach(el => {
    observer.observe(el);
});

// Form Handler for Lead Magnet
async function handleSubmit(e) {
    e.preventDefault();

    const emailInput = e.target.querySelector('.email-input');
    const submitButton = e.target.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();

    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    try {
        const response = await fetch('/api/guide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Unable to send the guide');
        }

        alert('Thank you! Your guide has been sent to ' + email + '.');
        e.target.reset();
    } catch (error) {
        alert(error.message);
    } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
    }
}

// Navbar Scroll Effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(11, 42, 74, 0.98)';
        navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.1)';
    } else {
        navbar.style.background = 'rgba(11, 42, 74, 0.95)';
        navbar.style.boxShadow = 'none';
    }
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.mobile-menu-toggle');

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
