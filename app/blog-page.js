'use client';

import { useEffect, useMemo, useState } from 'react';

const categories = [
    ['all', 'All Posts'],
    ['scam-awareness', 'Scam Awareness'],
    ['education', 'Education'],
    ['opportunities', 'Opportunities'],
    ['lifestyle', 'Lifestyle'],
];

function formatDate(value) {
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function BlogPage() {
    const [posts, setPosts] = useState([]);
    const [category, setCategory] = useState('all');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [usingFallback, setUsingFallback] = useState(false);

    useEffect(() => {
        async function loadPosts() {
            try {
                const response = await fetch('/api/posts');
                if (!response.ok) throw new Error(`Blog service returned ${response.status}`);
                setPosts(await response.json());
            } catch (apiError) {
                try {
                    const fallbackResponse = await fetch('/data/blog-data.json');
                    if (!fallbackResponse.ok) throw new Error(`Local blog data returned ${fallbackResponse.status}`);
                    const fallbackData = await fallbackResponse.json();
                    if (!Array.isArray(fallbackData.posts)) throw new Error('Local blog data is invalid');
                    setPosts(fallbackData.posts);
                    setUsingFallback(true);
                } catch (fallbackError) {
                    console.error('Unable to load blog data:', { apiError, fallbackError });
                    setError('Articles are temporarily unavailable. Please try again later.');
                }
            } finally {
                setLoading(false);
            }
        }

        const tag = new URLSearchParams(window.location.search).get('tag');
        if (tag) setQuery(tag);
        loadPosts();
    }, []);

    const visiblePosts = useMemo(() => {
        const search = query.trim().toLowerCase();
        return posts
            .filter((post) => category === 'all' || post.category === category)
            .filter((post) => !search || [post.title, post.excerpt, post.categoryLabel, ...(post.tags || [])]
                .some((value) => String(value || '').toLowerCase().includes(search)))
            .sort((first, second) => new Date(second.date) - new Date(first.date));
    }, [posts, category, query]);

    return (
        <>
            <section className="blog-hero">
                <div className="container">
                    <h1>CarnegienFreedom Blog</h1>
                    <p>Educational insights, scam awareness tips, and practical guidance to help you navigate opportunities safely and confidently.</p>
                </div>
            </section>
            <main className="blog-container">
                <div className="blog-filters">
                    <div className="category-filters">
                        {categories.map(([value, label]) => (
                            <button key={value} className={`filter-btn ${category === value ? 'active' : ''}`} onClick={() => setCategory(value)}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="search-box">
                        <i className="fas fa-search" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search articles..." aria-label="Search articles" />
                    </div>
                </div>
                {usingFallback && !loading && <p className="export-status" role="status">Showing saved articles while the blog service is unavailable. Admin editing requires the database connection.</p>}
                <div className="blog-grid">
                    {loading && <div className="loading-spinner"><i className="fas fa-spinner" /><p>Loading articles...</p></div>}
                    {!loading && error && <div className="no-results"><i className="fas fa-exclamation-circle" /><h3>Unable to load articles</h3><p>{error}</p></div>}
                    {!loading && !error && visiblePosts.length === 0 && <div className="no-results"><i className="fas fa-search" /><h3>No articles found</h3><p>Try adjusting your search or category filter.</p></div>}
                    {!loading && !error && visiblePosts.map((post, index) => {
                        const featured = category === 'all' && !query.trim() && post.featured
                            && !visiblePosts.slice(0, index).some((item) => item.featured);
                        return (
                            <a className={`blog-card ${featured ? 'featured-post' : ''}`} href={`/blog-post?slug=${encodeURIComponent(post.slug)}`} key={post.id}>
                                <img src={post.image} alt={post.title} className="blog-image" />
                                <div className="blog-content">
                                    {featured && <div className="featured-badge"><i className="fas fa-star" /> Featured</div>}
                                    <span className="blog-category">{post.categoryLabel}</span>
                                    <h3>{post.title}</h3>
                                    <p className="blog-excerpt">{post.excerpt}</p>
                                    <div className="blog-meta"><span><i className="fas fa-calendar" /> {formatDate(post.date)}</span><span><i className="fas fa-clock" /> {post.readTime}</span></div>
                                </div>
                            </a>
                        );
                    })}
                </div>
            </main>
        </>
    );
}
