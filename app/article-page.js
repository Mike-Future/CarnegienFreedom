'use client';

import { useEffect, useState } from 'react';

function formatDate(value) {
    return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ArticlePage({ slug }) {
    const [post, setPost] = useState(null);
    const [related, setRelated] = useState([]);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!slug) {
            setError('No article specified');
            return;
        }
        Promise.all([
            fetch(`/api/posts/slug/${encodeURIComponent(slug)}`).then((response) => response.ok ? response.json() : null),
            fetch('/api/posts').then((response) => response.ok ? response.json() : []),
        ]).then(([loadedPost, posts]) => {
            if (!loadedPost) {
                setError('Article not found');
                return;
            }
            setPost(loadedPost);
            setRelated(posts.filter((item) => item.id !== loadedPost.id && item.category === loadedPost.category).slice(0, 3));
            document.title = `${loadedPost.title} | CarnegienFreedom Blog`;
        }).catch(() => setError('Unable to load article. Please try again later.'));
    }, [slug]);

    if (error) {
        return <section className="article-container" style={{ textAlign: 'center', padding: '8rem 2rem' }}><h2>Article unavailable</h2><p>{error}</p><a href="/blog" className="btn-primary">Browse All Articles</a></section>;
    }
    if (!post) {
        return <header className="article-header"><div className="loading-spinner"><i className="fas fa-spinner" /><p>Loading article...</p></div></header>;
    }

    return (
        <>
            <header className="article-header">
                <div className="article-meta">
                    <a href="/blog" className="back-link"><i className="fas fa-arrow-left" /> Back to Blog</a>
                    <span className="article-category">{post.categoryLabel}</span>
                    <h1 className="article-title">{post.title}</h1>
                    <div className="article-info"><span><i className="fas fa-user" /> {post.author}</span><span><i className="fas fa-calendar" /> {formatDate(post.date)}</span><span><i className="fas fa-clock" /> {post.readTime}</span></div>
                </div>
            </header>
            <article className="article-container">
                <img src={post.image} alt={post.title} className="article-featured-image" />
                <div className="article-content" dangerouslySetInnerHTML={{ __html: post.content }} />
                <div className="article-tags">{(post.tags || []).map((tag) => <a href={`/blog?tag=${encodeURIComponent(tag)}`} className="article-tag" key={tag}>#{tag}</a>)}</div>
            </article>
            {related.length > 0 && <section className="related-articles"><div className="container"><h3>Related Articles</h3><div className="related-grid">{related.map((item) => <a className="blog-card" href={`/blog-post?slug=${encodeURIComponent(item.slug)}`} key={item.id}><img src={item.image} alt={item.title} className="blog-image" /><div className="blog-content"><span className="blog-category">{item.categoryLabel}</span><h3>{item.title}</h3></div></a>)}</div></div></section>}
        </>
    );
}
