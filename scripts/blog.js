// LegitWays Blog - Dynamic Blog System
// Loads and displays blog posts from blog-data.json

let allPosts = [];
let filteredPosts = [];

// Initialize blog when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    loadBlogPosts();
    setupEventListeners();
});

// Load blog posts from JSON
async function loadBlogPosts() {
    try {
        const response = await fetch('../data/blog-data.json');
        const data = await response.json();
        allPosts = data.posts;
        filteredPosts = allPosts;

        renderPosts();
    } catch (error) {
        console.error('Error loading blog posts:', error);
        document.getElementById('blogGrid').innerHTML = `
            <div class="no-results">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Unable to load articles</h3>
                <p>Please refresh the page or try again later.</p>
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

    const postsHTML = filteredPosts.map(post => {
        const isFeatured = post.featured && document.querySelector('.filter-btn.active')?.dataset.category === 'all';

        return `
            <article class="blog-card ${isFeatured ? 'featured-post' : ''}" onclick="openArticle('${post.slug}')">
                <img src="${post.image}" alt="${post.title}" class="blog-image" onerror="this.src='https://via.placeholder.com/800x400/0B2A4A/FFFFFF?text=LegitWays'">
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
    // Category filters
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter posts
            const category = btn.dataset.category;
            filterPosts(category);
        });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        searchPosts(e.target.value);
    });
}

// Filter posts by category
function filterPosts(category) {
    if (category === 'all') {
        filteredPosts = allPosts;
    } else {
        filteredPosts = allPosts.filter(post => post.category === category);
    }
    renderPosts();
}

// Search posts
function searchPosts(query) {
    const searchTerm = query.toLowerCase().trim();

    if (searchTerm === '') {
        // Reset to current category filter
        const activeCategory = document.querySelector('.filter-btn.active').dataset.category;
        filterPosts(activeCategory);
        return;
    }

    filteredPosts = allPosts.filter(post => {
        return post.title.toLowerCase().includes(searchTerm) ||
            post.excerpt.toLowerCase().includes(searchTerm) ||
            post.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
            post.categoryLabel.toLowerCase().includes(searchTerm);
    });

    renderPosts();
}

// Navigate to article page
function openArticle(slug) {
    window.location.href = `blog-post.html?slug=${slug}`;
}

// Format date for display
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Mobile menu toggle (shared function)
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    menu.classList.toggle('active');
}

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
