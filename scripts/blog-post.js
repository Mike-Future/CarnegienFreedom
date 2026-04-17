// LegitWays Dynamic Blog Post Viewer
// Loads specific article from IndexedDB based on URL parameter

let db = null;
let currentPost = null;
let allPosts = [];

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize database
        const dbAPI = await LegitWaysDB.initDB();
        db = dbAPI;

        // Load article
        await loadArticle();
    } catch (error) {
        console.error('Failed to initialize article:', error);
        showError('Unable to load article. Please try again later.');
    }
});

// Load specific article from URL parameter
async function loadArticle() {
    // Get slug from URL
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    if (!slug) {
        showError('No article specified');
        return;
    }

    // Show loading
    const header = document.getElementById('articleHeader');
    header.innerHTML = `
        <div class="loading-spinner">
            <i class="fas fa-spinner"></i>
            <p>Loading article...</p>
        </div>
    `;

    try {
        // Load all posts for related articles
        allPosts = await db.getAllPosts();

        // Find specific post
        currentPost = await db.getPostBySlug(slug);

        if (!currentPost) {
            showError('Article not found');
            return;
        }

        // Render the article
        renderArticle();
        renderRelatedArticles();

        // Update page title
        document.title = `${currentPost.title} | LegitWays Blog`;

        // Update meta description
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
            metaDesc.content = currentPost.excerpt;
        }

        // Track view (optional analytics)
        console.log(`Article viewed: ${currentPost.title}`);

    } catch (error) {
        console.error('Error loading article:', error);
        showError('Unable to load article');
    }
}

// Render the full article
function renderArticle() {
    const header = document.getElementById('articleHeader');
    const container = document.getElementById('articleContainer');

    // Render header
    header.innerHTML = `
        <div class="article-meta">
            <a href="blog.html" class="back-link">
                <i class="fas fa-arrow-left"></i> Back to Blog
            </a>
            <span class="article-category">${currentPost.categoryLabel}</span>
            <h1 class="article-title">${currentPost.title}</h1>
            <div class="article-info">
                <span><i class="fas fa-user"></i> ${currentPost.author}</span>
                <span><i class="fas fa-calendar"></i> ${formatDate(currentPost.date)}</span>
                <span><i class="fas fa-clock"></i> ${currentPost.readTime}</span>
            </div>
        </div>
    `;

    // Render content
    container.innerHTML = `
        <img src="${currentPost.image}" alt="${currentPost.title}" class="article-featured-image" 
             onerror="this.style.display='none'">

        <div class="article-content">
            ${currentPost.content}
        </div>

        <div class="article-tags">
            ${currentPost.tags.map(tag => `<a href="blog.html?tag=${encodeURIComponent(tag)}" class="article-tag">#${tag}</a>`).join('')}
        </div>

        <div class="share-section">
            <h4>Share this article</h4>
            <div class="share-buttons">
                <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" 
                   target="_blank" class="share-btn facebook" aria-label="Share on Facebook">
                    <i class="fab fa-facebook-f"></i>
                </a>
                <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(currentPost.title)}" 
                   target="_blank" class="share-btn twitter" aria-label="Share on Twitter">
                    <i class="fab fa-twitter"></i>
                </a>
                <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}" 
                   target="_blank" class="share-btn linkedin" aria-label="Share on LinkedIn">
                    <i class="fab fa-linkedin-in"></i>
                </a>
                <a href="https://wa.me/?text=${encodeURIComponent(currentPost.title + ' ' + window.location.href)}" 
                   target="_blank" class="share-btn whatsapp" aria-label="Share on WhatsApp">
                    <i class="fab fa-whatsapp"></i>
                </a>
            </div>
        </div>
    `;
}

// Render related articles
function renderRelatedArticles() {
    const relatedGrid = document.getElementById('relatedGrid');

    if (!relatedGrid) return;

    // Find related posts (same category, excluding current)
    let related = allPosts.filter(post =>
        post.category === currentPost.category && post.id !== currentPost.id
    );

    // If not enough in same category, add other recent posts
    if (related.length < 3) {
        const otherPosts = allPosts.filter(post =>
            post.id !== currentPost.id && !related.find(r => r.id === post.id)
        ).slice(0, 3 - related.length);
        related = [...related, ...otherPosts];
    }

    // Limit to 3 posts
    related = related.slice(0, 3);

    if (related.length === 0) {
        relatedGrid.innerHTML = '<p style="text-align: center; color: #6b7280;">No related articles found.</p>';
        return;
    }

    const relatedHTML = related.map(post => `
        <article class="blog-card" onclick="openArticle('${post.slug}')" style="cursor: pointer;">
            <img src="${post.image}" alt="${post.title}" class="blog-image" style="height: 150px;" 
                 onerror="this.src='https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80'">
            <div class="blog-content" style="padding: 1.25rem;">
                <span class="blog-category">${post.categoryLabel}</span>
                <h3 style="font-size: 1.1rem; margin-bottom: 0.5rem;">${post.title}</h3>
                <div class="blog-meta" style="font-size: 0.8rem;">
                    <span><i class="fas fa-clock"></i> ${post.readTime}</span>
                </div>
            </div>
        </article>
    `).join('');

    relatedGrid.innerHTML = relatedHTML;
}

// Show error message
function showError(message) {
    const header = document.getElementById('articleHeader');
    const container = document.getElementById('articleContainer');

    header.innerHTML = `
        <div class="article-meta" style="text-align: center;">
            <a href="blog.html" class="back-link">
                <i class="fas fa-arrow-left"></i> Back to Blog
            </a>
        </div>
    `;

    container.innerHTML = `
        <div style="text-align: center; padding: 4rem 2rem;">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #F2C94C; margin-bottom: 1rem;"></i>
            <h2 style="color: #0B2A4A; margin-bottom: 1rem;">Article Not Found</h2>
            <p style="color: #6b7280; margin-bottom: 2rem;">${message}</p>
            <a href="blog.html" class="btn-primary" style="display: inline-flex; background: #3CB54A; color: white; padding: 1rem 2rem; border-radius: 50px; text-decoration: none;">
                <i class="fas fa-book-open"></i> Browse All Articles
            </a>
        </div>
    `;

    // Hide related articles section
    const relatedSection = document.querySelector('.related-articles');
    if (relatedSection) {
        relatedSection.style.display = 'none';
    }
}

// Navigate to article
function openArticle(slug) {
    window.location.href = `blog-post.html?slug=${slug}`;
}

// Format date
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

// Smooth scroll for anchor links
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

// Make functions globally available
window.openArticle = openArticle;
window.toggleMobileMenu = toggleMobileMenu;
