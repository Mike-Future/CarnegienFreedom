const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'blog-data.json');
const GUIDE_FILE = path.join(__dirname, 'assets', 'legit-ways-guide.pdf');
let databaseAvailable = false;

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
        content: row.content,
        sourceDocumentName: row.source_document_name || null
    };
}

async function createBootstrapAdmin() {
    const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
    const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '');

    if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return;
    }

    const { rows } = await pool.query('SELECT 1 FROM admin_users LIMIT 1');
    if (rows.length > 0) {
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO admin_users (username, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [username, email, passwordHash]
    );
    console.log(`Created bootstrap admin account for ${email}`);
}

async function initDatabase() {
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token_hash TEXT PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        );
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_featured ON posts(featured);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);`);
    await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_document_name TEXT;`);

    await createBootstrapAdmin();
    await loadDefaultDataIfEmpty();
    databaseAvailable = true;
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
    if (!databaseAvailable) {
        return res.status(503).json({ status: 'database-unavailable' });
    }
    res.json({ status: 'ok' });
});

function createSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

function hashSessionToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function setSessionCookie(res, token) {
    res.setHeader('Set-Cookie', `legitways_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
}

function getSessionToken(req) {
    const cookies = String(req.headers.cookie || '').split(';');
    const sessionCookie = cookies.find(cookie => cookie.trim().startsWith('legitways_session='));
    return sessionCookie ? sessionCookie.trim().slice('legitways_session='.length) : null;
}

async function requireAdmin(req, res, next) {
    if (!databaseAvailable) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    const token = getSessionToken(req);
    if (!token) {
        return res.status(401).json({ error: 'Admin login required' });
    }

    let result;
    try {
        result = await pool.query(
            `SELECT admin_users.id, admin_users.username, admin_users.email
             FROM admin_sessions
             JOIN admin_users ON admin_users.id = admin_sessions.user_id
             WHERE admin_sessions.token_hash = $1 AND admin_sessions.expires_at > NOW()`,
            [hashSessionToken(token)]
        );
    } catch (error) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    if (!result.rows[0]) {
        return res.status(401).json({ error: 'Admin session expired' });
    }

    req.adminUser = result.rows[0];
    next();
}

app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return res.status(400).json({ error: 'Username, valid email, and password of at least 8 characters are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO admin_users (username, email, password_hash)
             VALUES ($1, $2, $3)
             RETURNING id, username, email`,
            [username, email, passwordHash]
        );
        const token = createSessionToken();
        await pool.query(
            `INSERT INTO admin_sessions (token_hash, user_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
            [hashSessionToken(token), result.rows[0].id]
        );
        setSessionCookie(res, token);
        res.status(201).json({ user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        console.error('Admin registration failed:', error.message);
        res.status(500).json({ error: 'Unable to create admin account' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    let result;
    try {
        result = await pool.query('SELECT id, username, email, password_hash FROM admin_users WHERE email = $1 LIMIT 1', [email]);
    } catch (error) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    if (!result.rows[0] || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = createSessionToken();
    await pool.query(
        `INSERT INTO admin_sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [hashSessionToken(token), result.rows[0].id]
    );
    setSessionCookie(res, token);
    res.json({ user: { id: result.rows[0].id, username: result.rows[0].username, email: result.rows[0].email } });
});

app.get('/api/auth/session', requireAdmin, (req, res) => {
    res.json({ user: req.adminUser });
});

app.post('/api/auth/logout', async (req, res) => {
    const token = getSessionToken(req);
    try {
        if (token && databaseAvailable) {
            await pool.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hashSessionToken(token)]);
        }
    } catch (error) {
        console.error('Admin logout cleanup failed:', error.message);
    }
    res.setHeader('Set-Cookie', 'legitways_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    res.status(204).end();
});

app.post('/api/guide', async (req, res) => {
    const email = String(req.body?.email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
    }

    const smtpHost = String(process.env.SMTP_HOST || '').trim();
    const smtpUser = String(process.env.SMTP_USER || '').trim();
    const smtpPassword = String(process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');
    const smtpFrom = String(process.env.SMTP_FROM || smtpUser).trim();
    const smtpSecureSetting = String(process.env.SMTP_SECURE || '').trim().toLowerCase();

    if (!smtpHost || !smtpUser || !smtpPassword) {
        return res.status(503).json({ error: 'Email delivery is not configured' });
    }

    try {
        const smtpPort = Number(process.env.SMTP_PORT || 587);
        if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
            return res.status(503).json({ error: 'Email delivery is misconfigured' });
        }

        const smtpSecure = smtpSecureSetting === 'true' || (smtpSecureSetting === '' && smtpPort === 465);
        await fs.access(GUIDE_FILE);

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
                user: smtpUser,
                pass: smtpPassword
            }
        });

        await transporter.sendMail({
            from: smtpFrom,
            envelope: { from: smtpUser, to: email },
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
        console.error('Guide email failed:', {
            code: error.code,
            responseCode: error.responseCode,
            message: error.message
        });

        if (error.code === 'ENOENT') {
            return res.status(503).json({ error: 'The guide file is unavailable' });
        }

        res.status(502).json({ error: 'The email provider rejected the guide request' });
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

app.post('/api/posts', requireAdmin, async (req, res) => {
    const post = req.body;
    if (!post || !post.id || !post.slug || !post.title) {
        return res.status(400).json({ error: 'Post id, slug, and title are required' });
    }

    await pool.query(
        `INSERT INTO posts (id, slug, title, excerpt, category, categoryLabel, author, date, readTime, featured, image, tags, content, source_document_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
           content = EXCLUDED.content,
           source_document_name = EXCLUDED.source_document_name;`,
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
            post.content || null,
            post.sourceDocumentName || null
        ]
    );

    await updateCategoryCounts();
    res.json({ success: true });
});

app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    await updateCategoryCounts();
    res.status(204).end();
});

app.get('/api/categories', async (req, res) => {
    const result = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    res.json(result.rows);
});

app.post('/api/categories', requireAdmin, async (req, res) => {
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

app.post('/api/categories/update-counts', requireAdmin, async (req, res) => {
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

app.post('/api/settings', requireAdmin, async (req, res) => {
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

app.post('/api/data/import', requireAdmin, async (req, res) => {
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

app.post('/api/data/clear', requireAdmin, async (req, res) => {
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
    .catch((error) => {
        console.error('Database unavailable; serving local blog data:', error.message);
    })
    .finally(() => {
        app.listen(PORT, () => {
            console.log(`Server started on http://localhost:${PORT}`);
        });
    });

const helmet = require('helmet');
app.use(helmet());
