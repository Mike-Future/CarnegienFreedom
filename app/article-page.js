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
        async function loadArticle() {
            let loadedPost;
            let posts;
            try {
                const response = await fetch(`/api/posts/slug/${encodeURIComponent(slug)}`);
                if (response.status === 404) {
                    setError('Article not found');
                    return;
                }
                if (!response.ok) throw new Error(`Blog service returned ${response.status}`);
                loadedPost = await response.json();
                const postsResponse = await fetch('/api/posts');
                posts = postsResponse.ok ? await postsResponse.json() : [loadedPost];
            } catch (apiError) {
                try {
                    const response = await fetch('/data/blog-data.json');
                    if (!response.ok) throw new Error(`Local blog data returned ${response.status}`);
                    const data = await response.json();
                    if (!Array.isArray(data.posts)) throw new Error('Local blog data is invalid');
                    posts = data.posts;
                    loadedPost = posts.find((item) => item.slug === slug) || null;
                } catch (fallbackError) {
                    console.error('Unable to load article:', { apiError, fallbackError });
                    setError('Unable to load article. Please try again later.');
                    return;
                }
            }

            if (!loadedPost) {
                setError('Article not found');
                return;
            }
            setPost(loadedPost);
            setRelated(posts.filter((item) => item.id !== loadedPost.id && item.category === loadedPost.category).slice(0, 3));
            document.title = `${loadedPost.title} | CarnegienFreedom Blog`;
        }

        loadArticle();
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
