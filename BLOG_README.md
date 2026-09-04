# CarnegienFreedom Dynamic Blog System

## Overview

This is a **Node.js dynamic blog system**. The Express backend stores blog content in PostgreSQL and serves it to the existing browser UI through JSON APIs.

## How It Works

### Data Flow

1. **PostgreSQL** - Stores all blog posts, categories, settings, and metadata
2. **Express API** - Reads and updates the database through server-side routes
3. **HTML Templates** - Provide the structure, content is injected by JS

## Start the Database and Server

1. Install Docker Desktop.
2. Run `npm run db:start` to start PostgreSQL.
3. Run `npm start` to start the Node.js server.
4. Open `http://localhost:3000/blog.html`.

The first server start creates the tables and imports the default data from `data/blog-data.json` when the database is empty.

### Files Added

| File             | Purpose                                             |
| ---------------- | --------------------------------------------------- |
| `blog.html`      | Blog listing page with filters and search           |
| `blog-post.html` | Individual article template                         |
| `blog.js`        | Blog listing functionality (filter, search, render) |
| `blog-post.js`   | Individual article loader and renderer              |
| `blog-data.json` | Database containing all blog posts                  |

## Features

### Blog Listing Page (blog.html)

- ✅ Category filtering (All, Scam Awareness, Education, Opportunities, Lifestyle)
- ✅ Real-time search (searches title, excerpt, tags, category)
- ✅ Featured post highlighting
- ✅ Responsive grid layout
- ✅ Loading states
- ✅ "No results" handling

### Individual Article Page (blog-post.html)

- ✅ Dynamic content loading based on URL parameter (`?slug=article-name`)
- ✅ Full article rendering with HTML content support
- ✅ Social sharing buttons (Facebook, Twitter, LinkedIn, WhatsApp)
- ✅ Related articles (same category)
- ✅ Tag system
- ✅ Error handling for missing articles

### Content Management (blog-data.json)

Each post includes:

- `id`, `slug` (URL-friendly name)
- `title`, `excerpt` (for previews)
- `category`, `categoryLabel`
- `author`, `date`, `readTime`
- `featured` (boolean for highlighting)
- `image` (URL to featured image)
- `tags` (array for related content)
- `content` (full HTML content)

## How to Add New Blog Posts

1. **Open `blog-data.json`**
2. **Add a new post object** to the `posts` array:

```json
{
  "id": "7",
  "slug": "your-article-url-slug",
  "title": "Your Article Title",
  "excerpt": "Brief description for previews...",
  "category": "scam-awareness",
  "categoryLabel": "Scam Awareness",
  "author": "Author Name",
  "date": "2026-04-05",
  "readTime": "5 min read",
  "featured": false,
  "image": "https://images.unsplash.com/...",
  "tags": ["tag1", "tag2", "tag3"],
  "content": "<p>Your HTML content here...</p>"
}
```

3. **Update category count** if adding to existing category
4. **Save file** - Changes appear immediately (refresh browser)

## Content Formatting Tips

### HTML Content Support

The `content` field supports full HTML:

- `<p>` paragraphs
- `<h2>`, `<h3>` headings
- `<ul>`, `<ol>` lists
- `<blockquote>` quotes
- `<div class="warning-box">` for warnings
- `<div class="tip-box">` for tips
- `<strong>` bold text

### Special CSS Classes

Use these classes in your HTML content:

- `warning-box` - Yellow warning callout
- `tip-box` - Green tip callout
- `featured-post` - Large featured layout (auto-applied)

## Navigation Integration

The blog is now integrated into your main navigation:

- Added "Blog" link to main navbar
- Links to blog.html from homepage
- "Back to Blog" links on article pages
- Blog link in footer

## SEO Considerations

### Current Implementation

- ✅ Meta descriptions from excerpts
- ✅ Semantic HTML (article, header tags)
- ✅ Clean URL slugs
- ✅ Mobile-responsive design

### For Better SEO (Optional Enhancements)

Consider adding:

- Static HTML generation (using tools like 11ty)
- Server-side rendering for meta tags
- XML sitemap
- Structured data (Schema.org)

## Hosting Requirements

This blog system works on **any static host**:

- GitHub Pages
- Netlify
- Vercel
- Traditional web hosting
- Amazon S3

No server-side processing required!

## Performance

- **Initial load**: ~50KB for JSON data (6 posts)
- **Caching**: Browser caches JSON after first load
- **Images**: Loaded from external URLs (Unsplash)
- **Lazy loading**: Can be added for images if needed

## Security Notes

- No user input accepted (read-only system)
- No database to hack
- No server-side vulnerabilities
- Content is public by design

## Sample Posts Included

1. **How to Spot Online Job Scams** (Featured)
2. **Education Before Earning: Why This Approach Works**
3. **Digital Skills Worth Learning in 2026**
4. **The Psychology of Scams: Why Smart People Fall for Them**
5. **Passive Income Myths Debunked**
6. **How to Evaluate Online Courses**

All posts align with CarnegienFreedom brand: education-first, scam-aware, realistic expectations.

## Next Steps

1. Download all files to same folder
2. Open `blog.html` to see blog listing
3. Click any article to see individual post view
4. Edit `blog-data.json` to add your own content
5. Deploy to any web host

## Support

For questions about:

- **Adding posts**: Edit blog-data.json following the format above
- **Styling**: Modify styles.css (blog section at bottom)
- **Functionality**: Check blog.js or blog-post.js

---

**Note**: This is a static blog system. User comments and analytics would require separate third-party services.
