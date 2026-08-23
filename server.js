const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'blog-data.json');
const GUIDE_FILE = path.join(__dirname, 'assets', 'legit-ways-guide.pdf');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function normalizePost(row) {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        excerpt: row.excerpt,
        category: row.category,
        categoryLabel: row.categorylabel,
        author: row.author,
        date: row.date,
        readTime: row.readtime,
        featured: row.featured,
        image: row.image,
        tags: row.tags || [],
        content: row.content
    };
}

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            slug TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            excerpt TEXT,
            category TEXT REFERENCES categories(id) ON DELETE SET NULL,
            categoryLabel TEXT,
            author TEXT,
            date TEXT,
            readTime TEXT,
            featured BOOLEAN DEFAULT false,
            image TEXT,
            tags JSONB DEFAULT '[]',
            content TEXT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL
        );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts(featured);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);`);

    await loadDefaultDataIfEmpty();
}

async function loadDefaultDataIfEmpty() {
    const { rows } = await pool.query('SELECT 1 FROM posts LIMIT 1');
    if (rows.length > 0) {
        return;
    }

    try {
        const content = await fs.readFile(DATA_FILE, 'utf-8');
        const defaultData = JSON.parse(content);

        if (Array.isArray(defaultData.categories)) {
            for (const category of defaultData.categories) {
                await pool.query(
                    `INSERT INTO categories (id, name, count) VALUES ($1, $2, $3)
                     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, count = EXCLUDED.count;`,
                    [category.id, category.name, category.count || 0]
                );
            }
        }

        if (Array.isArray(defaultData.posts)) {
            for (const post of defaultData.posts) {
                await pool.query(
                    `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                     ON CONFLICT (id) DO UPDATE SET
                        slug = EXCLUDED.slug,
                        title = EXCLUDED.title,
                        excerpt = EXCLUDED.excerpt,
                        category = EXCLUDED.category,
                        categoryLabel = EXCLUDED.categoryLabel,
                        author = EXCLUDED.author,
                        date = EXCLUDED.date,
                        readTime = EXCLUDED.readTime,
                        featured = EXCLUDED.featured,
                        image = EXCLUDED.image,
                        tags = EXCLUDED.tags,
                        content = EXCLUDED.content;`,
                    [
                        post.id,
                        post.slug,
                        post.title,
                        post.excerpt,
                        post.category,
                        post.categoryLabel,
                        post.author,
                        post.date,
                        post.readTime,
                        post.featured || false,
                        post.image || null,
                        JSON.stringify(post.tags || []),
                        post.content || ''
                    ]
                );
            }
        }

        await updateCategoryCounts();
        console.log('Loaded default blog data into Postgres');
    } catch (error) {
        console.error('Failed to load default data:', error.message);
    }
}

async function updateCategoryCounts() {
    await pool.query(`
        UPDATE categories
        SET count = COALESCE(sub.count, 0)
        FROM (
            SELECT category, COUNT(*) AS count
            FROM posts
            GROUP BY category
        ) AS sub
        WHERE categories.id = sub.category;
    `);

    await pool.query(`
        UPDATE categories
        SET count = 0
        WHERE id NOT IN (SELECT category FROM posts);
    `);
}

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/api/guide', async (req, res) => {
    const email = String(req.body?.email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        return res.status(503).json({ error: 'Email delivery is not configured' });
    }

    try {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });

        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: email,
            subject: 'Your LegitWays educational guide',
            text: 'Thank you for requesting the LegitWays educational guide. It is attached to this email.',
            attachments: [{
                filename: 'legit-ways-guide.pdf',
                path: GUIDE_FILE,
                contentType: 'application/pdf'
            }]
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Guide email failed:', error.message);
        res.status(500).json({ error: 'Unable to send the guide right now' });
    }
});

app.get('/api/posts', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/slug/:slug', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE slug = $1 LIMIT 1', [req.params.slug]);
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Post not found' });
    }
    res.json(normalizePost(result.rows[0]));
});

app.get('/api/posts/category/:category', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE category = $1 ORDER BY date DESC NULLS LAST', [req.params.category]);
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/featured', async (req, res) => {
    const result = await pool.query('SELECT * FROM posts WHERE featured = true ORDER BY date DESC NULLS LAST');
    res.json(result.rows.map(normalizePost));
});

app.get('/api/posts/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) {
        const result = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
        return res.json(result.rows.map(normalizePost));
    }

    const searchTerm = `%${q}%`;
    const result = await pool.query(
        `SELECT * FROM posts
         WHERE title ILIKE $1 OR excerpt ILIKE $1 OR categoryLabel ILIKE $1 OR tags::text ILIKE $1
         ORDER BY date DESC NULLS LAST`,
        [searchTerm]
    );
    res.json(result.rows.map(normalizePost));
});

app.post('/api/posts', async (req, res) => {
    const post = req.body;
    if (!post || !post.id || !post.slug || !post.title) {
        return res.status(400).json({ error: 'Post id, slug, and title are required' });
    }

    await pool.query(
        `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           excerpt = EXCLUDED.excerpt,
           category = EXCLUDED.category,
           categoryLabel = EXCLUDED.categoryLabel,
           author = EXCLUDED.author,
           date = EXCLUDED.date,
           readTime = EXCLUDED.readTime,
           featured = EXCLUDED.featured,
           image = EXCLUDED.image,
           tags = EXCLUDED.tags,
           content = EXCLUDED.content;`,
        [
            post.id,
            post.slug,
            post.title,
            post.excerpt || null,
            post.category || null,
            post.categoryLabel || null,
            post.author || null,
            post.date || null,
            post.readTime || null,
            post.featured || false,
            post.image || null,
            JSON.stringify(post.tags || []),
            post.content || null
        ]
    );

    await updateCategoryCounts();
    res.json({ success: true });
});

app.delete('/api/posts/:id', async (req, res) => {
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    await updateCategoryCounts();
    res.status(204).end();
});

app.get('/api/categories', async (req, res) => {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
});

app.post('/api/categories', async (req, res) => {
    const category = req.body;
    if (!category || !category.id || !category.name) {
        return res.status(400).json({ error: 'Category id and name are required' });
    }
    await pool.query(
        `INSERT INTO categories (id, name, count)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, count = EXCLUDED.count;`,
        [category.id, category.name, category.count || 0]
    );
    res.json({ success: true });
});

app.post('/api/categories/update-counts', async (req, res) => {
    await updateCategoryCounts();
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
});

app.get('/api/settings/:key', async (req, res) => {
    const result = await pool.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [req.params.key]);
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json(result.rows[0].value);
});

app.post('/api/settings', async (req, res) => {
    const { key, value } = req.body;
    if (!key) {
        return res.status(400).json({ error: 'Setting key is required' });
    }
    await pool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
        [key, JSON.stringify(value)]
    );
    res.json({ success: true });
});

app.get('/api/data/export', async (req, res) => {
    const postsResult = await pool.query('SELECT * FROM posts ORDER BY date DESC NULLS LAST');
    const categoriesResult = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json({
        posts: postsResult.rows.map(normalizePost),
        categories: categoriesResult.rows
    });
});

app.post('/api/data/import', async (req, res) => {
    const data = req.body;
    if (!data || !Array.isArray(data.posts) || !Array.isArray(data.categories)) {
        return res.status(400).json({ error: 'Import payload must contain posts and categories arrays' });
    }

    await pool.query('BEGIN');
    try {
        await pool.query('DELETE FROM posts');
        await pool.query('DELETE FROM categories');

        for (const category of data.categories) {
            await pool.query(
                `INSERT INTO categories (id, name, count) VALUES ($1, $2, $3)`,
                [category.id, category.name, category.count || 0]
            );
        }

        for (const post of data.posts) {
            await pool.query(
                `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    post.id,
                    post.slug,
                    post.title,
                    post.excerpt || null,
                    post.category || null,
                    post.categoryLabel || null,
                    post.author || null,
                    post.date || null,
                    post.readTime || null,
                    post.featured || false,
                    post.image || null,
                    JSON.stringify(post.tags || []),
                    post.content || null
                ]
            );
        }

        await updateCategoryCounts();
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Import failed:', error);
        res.status(500).json({ error: 'Import failed' });
    }
});

app.post('/api/data/clear', async (req, res) => {
    await pool.query('DELETE FROM posts');
    await pool.query('DELETE FROM categories');
    res.status(204).end();
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    next();
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Server started on http://localhost:${PORT}`);
        });
    })
    .catch((error) => {
        console.error('Failed to initialize database:', error);
        process.exit(1);
    });
