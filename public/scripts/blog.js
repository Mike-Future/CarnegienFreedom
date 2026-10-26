// CarnegienFreedom Dynamic Blog System
// Uses IndexedDB for real-time content management

let db = null;
let allPosts = [];
let filteredPosts = [];

// Initialize whether this script loads before or after DOMContentLoaded.
async function initializeBlog() {
    try {
        // Initialize database
        const dbAPI = await LegitWaysDB.initDB();
        db = dbAPI;

        // Load and display posts
        await loadBlogPosts();
        setupEventListeners();

        console.log('Dynamic blog system initialized');
    } catch (error) {
        console.error('Failed to initialize blog:', error);
        document.getElementById('blogGrid').innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Unable to load articles</h3>
                <p>Please refresh the page or try again later.</p>
            </div>
        `;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBlog, { once: true });
} else {
    initializeBlog();
}

// Load blog posts from IndexedDB
async function loadBlogPosts() {
    const grid = document.getElementById('blogGrid');
    grid.innerHTML = `
        <div class="loading-spinner" style="grid-column: 1 / -1;">
            <i class="fas fa-spinner"></i>
            <p>Loading articles...</p>
        </div>
    `;

    try {
        allPosts = await db.getAllPosts();

        // Sort by date (newest first)
        allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

        filteredPosts = allPosts;
        renderPosts();
    } catch (error) {
        console.error('Error loading posts:', error);
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading articles</h3>
                <p>Unable to load blog posts. Please try again.</p>
            </div>
        `;
    }
}

// Render posts to the grid
function renderPosts() {
    const grid = document.getElementById('blogGrid');

    if (filteredPosts.length === 0) {
        grid.innerHTML = `
            <div class="no-results" style="grid-column: 1 / -1;">
                <i class="fas fa-search"></i>
                <h3>No articles found</h3>
                <p>Try adjusting your search or category filter.</p>
            </div>
        `;
        return;
    }

    // Check if we should show featured post (only on 'all' category with no search)
    const activeCategory = document.querySelector('.filter-btn.active')?.dataset.category;
    const searchQuery = document.getElementById('searchInput')?.value.trim();
    const showFeatured = activeCategory === 'all' && !searchQuery;

    const postsHTML = filteredPosts.map((post, index) => {
        const isFeatured = showFeatured && post.featured && index === 0;

        return `
            <article class="blog-card ${isFeatured ? 'featured-post' : ''}" data-post-slug="${encodeURIComponent(post.slug)}" tabindex="0" role="link">
                <img src="${post.image}" alt="${post.title}" class="blog-image" 
                     data-fallback-src="https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80">
                <div class="blog-content">
                    ${isFeatured ? '<div class="featured-badge"><i class="fas fa-star"></i> Featured</div>' : ''}
                    <span class="blog-category">${post.categoryLabel}</span>
                    <h3>${post.title}</h3>
                    <p class="blog-excerpt">${post.excerpt}</p>
                    <div class="blog-meta">
                        <span><i class="fas fa-calendar"></i> ${formatDate(post.date)}</span>
                        <span><i class="fas fa-clock"></i> ${post.readTime}</span>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    grid.innerHTML = postsHTML;
}

// Setup event listeners
function setupEventListeners() {
    const grid = document.getElementById('blogGrid');
    grid.addEventListener('click', event => {
        const card = event.target.closest('[data-post-slug]');
        if (card) openArticle(decodeURIComponent(card.dataset.postSlug));
    });
    grid.addEventListener('keydown', event => {
        const card = event.target.closest('[data-post-slug]');
        if (card && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            openArticle(decodeURIComponent(card.dataset.postSlug));
        }
    });
    grid.addEventListener('error', event => {
        const image = event.target;
        if (image instanceof HTMLImageElement && image.dataset.fallbackSrc) {
            image.removeAttribute('data-fallback-src');
            image.src = image.dataset.fallbackSrc;
        }
    }, true);

    // Category filters
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter posts
            const category = btn.dataset.category;
            await filterPosts(category);
        });
    });

    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchPosts(e.target.value);
        }, 300);
    });
}

// Filter posts by category
async function filterPosts(category) {
    showLoading(true);

    if (category === 'all') {
        filteredPosts = allPosts;
    } else {
        filteredPosts = await db.getPostsByCategory(category);
    }

    // Re-sort by date
    filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    renderPosts();
    showLoading(false);
}

// Search posts
async function searchPosts(query) {
    showLoading(true);

    const searchTerm = query.toLowerCase().trim();

    if (searchTerm === '') {
        const activeCategory = document.querySelector('.filter-btn.active').dataset.category;
        await filterPosts(activeCategory);
        return;
    }

    filteredPosts = await db.searchPosts(searchTerm);
    filteredPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    renderPosts();
    showLoading(false);
}

// Navigate to article page
function openArticle(slug) {
    window.location.href = `blog-post.html?slug=${slug}`;
}

// Show/hide loading
function showLoading(show) {
    const grid = document.getElementById('blogGrid');
    if (show) {
        grid.style.opacity = '0.5';
    } else {
        grid.style.opacity = '1';
    }
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Mobile menu toggle
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('active');
}

document.querySelector('.mobile-menu-toggle')?.addEventListener('click', toggleMobileMenu);

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.querySelector('.mobile-menu-toggle');

    if (mobileMenu && mobileMenu.classList.contains('active') &&
        !mobileMenu.contains(e.target) &&
        !menuToggle.contains(e.target)) {
        mobileMenu.classList.remove('active');
    }
});

// Make functions globally available
window.openArticle = openArticle;
window.toggleMobileMenu = toggleMobileMenu;
