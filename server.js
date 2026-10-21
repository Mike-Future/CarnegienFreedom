const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const next = require('next');
const backupService = require('./scripts/backup-service');
require('dotenv').config();

const app = express();
const nextApp = next({ dev: process.env.NODE_ENV !== 'production', dir: __dirname });
const nextHandle = nextApp.getRequestHandler();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'blog-data.json');
let databaseAvailable = false;
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const isProduction = process.env.NODE_ENV === 'production';
const PAGE_CONTENT_KEYS = new Set([
    'home',
    'about',
    'core-values',
    'contact',
    'cookie-policy',
    'disclaimer',
    'earnings-disclaimer',
    'privacy-policy',
    'scam-awareness',
    'success-stories',
    'terms-of-use'
]);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.disable('x-powered-by');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'data:'],
            imgSrc: ["'self'", 'https:', 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"]
        }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors((req, callback) => {
    const origin = req.header('Origin');
    const isAllowed = !origin || allowedOrigins.includes(origin);
    callback(null, { origin: isAllowed });
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts. Please try again later.' }
});

app.use(express.static(path.join(__dirname), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false
}));

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

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
        `INSERT INTO admin_users (username, email, password_hash, approved, is_super_admin)
         VALUES ($1, $2, $3, true, true)
         ON CONFLICT (email) DO UPDATE SET
            approved = true,
            is_super_admin = true
         RETURNING (xmax = 0) AS created`,
        [username, email, passwordHash]
    );
    console.log(`${result.rows[0].created ? 'Created' : 'Updated'} bootstrap super admin account for ${email}`);
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
            approved BOOLEAN NOT NULL DEFAULT false,
            is_super_admin BOOLEAN NOT NULL DEFAULT false,
            suspended BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_change_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            target_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            requested_by UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_change_votes (
            request_id UUID NOT NULL REFERENCES admin_change_requests(id) ON DELETE CASCADE,
            voter_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (request_id, voter_id)
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS page_content (
            page_key TEXT PRIMARY KEY,
            section_key TEXT NOT NULL DEFAULT 'section-1',
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS page_content_change_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            page_key TEXT NOT NULL,
            section_key TEXT NOT NULL DEFAULT 'section-1',
            section_label TEXT NOT NULL DEFAULT 'Section',
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            requested_by UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
            resolved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
        );
    `);

    await pool.query(`ALTER TABLE page_content ADD COLUMN IF NOT EXISTS section_key TEXT NOT NULL DEFAULT 'section-1';`);
    await pool.query(`ALTER TABLE page_content DROP CONSTRAINT IF EXISTS page_content_pkey;`);
    await pool.query(`ALTER TABLE page_content ADD CONSTRAINT page_content_pkey PRIMARY KEY (page_key, section_key);`);
    await pool.query(`ALTER TABLE page_content_change_requests ADD COLUMN IF NOT EXISTS section_key TEXT NOT NULL DEFAULT 'section-1';`);
    await pool.query(`ALTER TABLE page_content_change_requests ADD COLUMN IF NOT EXISTS section_label TEXT NOT NULL DEFAULT 'Section';`);
    await pool.query(`DROP INDEX IF EXISTS idx_page_content_one_pending_request;`);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_page_content_one_pending_section_request
        ON page_content_change_requests(page_key, section_key)
        WHERE status = 'pending';
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
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT false;`);
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;`);
    await pool.query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;`);

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
    const secureAttribute = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `legitways_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${secureAttribute}`);
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
            `SELECT admin_users.id, admin_users.username, admin_users.email,
                    admin_users.approved, admin_users.is_super_admin AS "isSuperAdmin",
                    admin_users.suspended
             FROM admin_sessions
             JOIN admin_users ON admin_users.id = admin_sessions.user_id
                         WHERE admin_sessions.token_hash = $1
                             AND admin_sessions.expires_at > NOW()
                             AND admin_users.approved = true
                             AND admin_users.suspended = false`,
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

async function requireSuperAdmin(req, res, next) {
    await requireAdmin(req, res, () => {
        if (!req.adminUser.isSuperAdmin) {
            return res.status(403).json({ error: 'Super admin approval required' });
        }
        next();
    });
}

app.post('/api/auth/register', authRateLimit, async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!username || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return res.status(400).json({ error: 'Username, valid email, and password of at least 8 characters are required' });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `INSERT INTO admin_users (username, email, password_hash, approved, is_super_admin)
             VALUES ($1, $2, $3, false, false)
             RETURNING id, username, email, approved`,
            [username, email, passwordHash]
        );
        res.status(202).json({ pending: true, user: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'An account with that email already exists' });
        }
        console.error('Admin registration failed:', error.message);
        res.status(500).json({ error: 'Unable to create admin account' });
    }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
    const identifier = String(req.body?.email || req.body?.identifier || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    let result;
    try {
        result = await pool.query(
            `SELECT id, username, email, password_hash, approved, is_super_admin, suspended
             FROM admin_users
             WHERE LOWER(email) = $1 OR LOWER(username) = $1
             ORDER BY CASE WHEN LOWER(email) = $1 THEN 0 ELSE 1 END`,
            [identifier]
        );
    } catch (error) {
        return res.status(503).json({ error: 'Database is unavailable' });
    }

    let account = null;
    for (const candidate of result.rows) {
        if (await bcrypt.compare(password, candidate.password_hash)) {
            account = candidate;
            break;
        }
    }

    if (!account) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!account.approved) {
        return res.status(403).json({ error: 'Your admin account is waiting for super admin approval.' });
    }

    if (account.suspended) {
        return res.status(403).json({ error: 'Your admin account has been suspended by a super admin.' });
    }

    const token = createSessionToken();
    await pool.query(
        `INSERT INTO admin_sessions (token_hash, user_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
        [hashSessionToken(token), account.id]
    );
    setSessionCookie(res, token);
    res.json({
        user: {
            id: account.id,
            username: account.username,
            email: account.email,
            approved: account.approved,
            isSuperAdmin: account.is_super_admin,
            suspended: account.suspended
        }
    });
});

app.get('/api/auth/session', requireAdmin, (req, res) => {
    res.json({ user: req.adminUser });
});

app.get('/api/page-content/:pageKey', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!PAGE_CONTENT_KEYS.has(req.params.pageKey)) {
        return res.status(404).json({ error: 'Page content not found' });
    }
    try {
        const result = await pool.query(
            `SELECT section_key AS "sectionKey", title, body
             FROM page_content
             WHERE page_key = $1
             ORDER BY section_key`,
            [req.params.pageKey]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Page content not found' });
        }
        res.json({ pageKey: req.params.pageKey, sections: result.rows });
    } catch (error) {
        console.error('Unable to load page content:', error.message);
        res.status(500).json({ error: 'Unable to load page content' });
    }
});

app.get('/api/admin/page-content-requests', requireSuperAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT requests.id, requests.page_key AS "pageKey",
                    requests.section_key AS "sectionKey", requests.section_label AS "sectionLabel",
                    requests.title, requests.body,
                    requests.requested_by AS "requestedBy", requests.created_at AS "createdAt",
                    requester.username AS "requesterUsername"
             FROM page_content_change_requests requests
             JOIN admin_users requester ON requester.id = requests.requested_by
             WHERE requests.status = 'pending'
             ORDER BY requests.created_at ASC`
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Unable to load page content requests:', error.message);
        res.status(500).json({ error: 'Unable to load page content requests' });
    }
});

app.post('/api/admin/page-content-requests', requireSuperAdmin, async (req, res) => {
    const pageKey = req.body?.pageKey;
    const sectionKey = req.body?.sectionKey;
    const sectionLabel = typeof req.body?.sectionLabel === 'string' ? req.body.sectionLabel.trim() : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (typeof pageKey !== 'string' || !PAGE_CONTENT_KEYS.has(pageKey)) {
        return res.status(400).json({ error: 'Choose a supported website page' });
    }
    if (typeof sectionKey !== 'string' || !/^(intro|section-[1-9]\d{0,2})$/.test(sectionKey)) {
        return res.status(400).json({ error: 'Choose a valid page section' });
    }
    if (!sectionLabel || sectionLabel.length > 160) {
        return res.status(400).json({ error: 'Section label must be between 1 and 160 characters' });
    }
    if (!title || title.length > 160) {
        return res.status(400).json({ error: 'Section heading must be between 1 and 160 characters' });
    }
    if (body.length > 30000) {
        return res.status(400).json({ error: 'Section copy must be no longer than 30000 characters' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO page_content_change_requests
                (page_key, section_key, section_label, title, body, requested_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, page_key AS "pageKey", section_key AS "sectionKey",
                       section_label AS "sectionLabel", title, body, status,
                       created_at AS "createdAt"`,
            [pageKey, sectionKey, sectionLabel, title, body, req.adminUser.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'A content request is already pending for this section' });
        }
        console.error('Unable to submit page content request:', error.message);
        res.status(500).json({ error: 'Unable to submit page content request' });
    }
});

app.post('/api/admin/page-content-requests/:id/resolve', requireSuperAdmin, async (req, res) => {
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!['approve', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'Decision must be approve or reject' });
    }

    let client;
    let transactionStarted = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transactionStarted = true;
        const requestResult = await client.query(
            `SELECT id, page_key, section_key, title, body, requested_by, status
             FROM page_content_change_requests
             WHERE id = $1
             FOR UPDATE`,
            [req.params.id]
        );
        const changeRequest = requestResult.rows[0];
        if (!changeRequest || changeRequest.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending page content request not found' });
        }
        if (changeRequest.requested_by === req.adminUser.id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Another super admin must review your page content request' });
        }

        const status = decision === 'approve' ? 'approved' : 'rejected';
        await client.query(
            `UPDATE page_content_change_requests
             SET status = $1, resolved_by = $2, resolved_at = NOW()
             WHERE id = $3`,
            [status, req.adminUser.id, changeRequest.id]
        );
        if (decision === 'approve') {
            await client.query(
                `INSERT INTO page_content (page_key, section_key, title, body, updated_by)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (page_key, section_key) DO UPDATE
                 SET title = EXCLUDED.title, body = EXCLUDED.body,
                     updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
                [changeRequest.page_key, changeRequest.section_key, changeRequest.title,
                    changeRequest.body, req.adminUser.id]
            );
        }
        await client.query('COMMIT');
        res.json({ id: changeRequest.id, status });
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Unable to roll back page content request:', rollbackError.message);
            }
        }
        console.error('Unable to resolve page content request:', error.message);
        res.status(500).json({ error: 'Unable to resolve page content request' });
    } finally {
        client?.release();
    }
});

app.get('/api/admin/pending', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT id, username, email, created_at
         FROM admin_users
         WHERE approved = false
         ORDER BY created_at ASC`
    );
    res.json(result.rows);
});

app.get('/api/admin', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT id, username, email, approved, is_super_admin AS "isSuperAdmin", suspended, created_at
         FROM admin_users
         ORDER BY is_super_admin DESC, approved DESC, created_at ASC`
    );
    res.json(result.rows);
});

app.get('/api/admin/change-requests', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `SELECT requests.id, requests.action, requests.status, requests.created_at,
            requests.requested_by,
                target.username AS target_username,
                requester.username AS requester_username,
                (SELECT COUNT(*) FROM admin_change_votes votes WHERE votes.request_id = requests.id) AS approvals,
                (SELECT GREATEST(1, CEIL(COUNT(*) / 2.0) - 1) FROM admin_users quorum_admins
                 WHERE quorum_admins.is_super_admin = true
                   AND quorum_admins.approved = true
                   AND quorum_admins.suspended = false) AS quorum
         FROM admin_change_requests requests
         JOIN admin_users target ON target.id = requests.target_user_id
         JOIN admin_users requester ON requester.id = requests.requested_by
         WHERE requests.status = 'pending'
         ORDER BY requests.created_at ASC`
    );
    res.json(result.rows);
});

app.post('/api/admin/:id/promote', requireSuperAdmin, async (req, res) => {
    if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ error: 'You are already a super admin' });
    }
    const result = await pool.query(
        `UPDATE admin_users
         SET approved = true, suspended = false, is_super_admin = true
         WHERE id = $1 AND is_super_admin = false
         RETURNING id, username, email, approved, is_super_admin AS "isSuperAdmin", suspended`,
        [req.params.id]
    );
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Regular admin account not found' });
    }
    res.json(result.rows[0]);
});

app.post('/api/admin/:id/change-request', requireSuperAdmin, async (req, res) => {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const allowedActions = new Set(['downgrade', 'suspend', 'delete']);
    if (!allowedActions.has(action)) {
        return res.status(400).json({ error: 'Action must be downgrade, suspend, or delete' });
    }
    if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ error: 'You cannot create a change request for yourself' });
    }

    const target = await pool.query(
        'SELECT id FROM admin_users WHERE id = $1 AND is_super_admin = true LIMIT 1',
        [req.params.id]
    );
    if (!target.rows[0]) {
        return res.status(404).json({ error: 'Super admin account not found' });
    }

    const existing = await pool.query(
        `SELECT id FROM admin_change_requests
         WHERE target_user_id = $1 AND action = $2 AND status = 'pending' LIMIT 1`,
        [req.params.id, action]
    );
    if (existing.rows[0]) {
        return res.status(409).json({ error: 'A matching change request is already pending' });
    }

    const result = await pool.query(
        `INSERT INTO admin_change_requests (target_user_id, requested_by, action)
         VALUES ($1, $2, $3)
         RETURNING id, action, status, created_at`,
        [req.params.id, req.adminUser.id, action]
    );
    res.status(201).json(result.rows[0]);
});

app.post('/api/admin/change-requests/:id/vote', requireSuperAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const requestResult = await client.query(
            `SELECT id, target_user_id, requested_by, action, status
             FROM admin_change_requests
             WHERE id = $1
             FOR UPDATE`,
            [req.params.id]
        );
        const changeRequest = requestResult.rows[0];
        if (!changeRequest || changeRequest.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pending change request not found' });
        }
        if (changeRequest.requested_by === req.adminUser.id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'The requester cannot confirm their own change request' });
        }
        if (changeRequest.target_user_id === req.adminUser.id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'The target super admin cannot confirm this change request' });
        }

        const superAdminCount = await client.query(
            `SELECT COUNT(*)::integer AS count
             FROM admin_users
             WHERE is_super_admin = true AND approved = true AND suspended = false`
        );
        const quorum = Math.max(1, Math.ceil(superAdminCount.rows[0].count / 2) - 1);
        await client.query(
            'INSERT INTO admin_change_votes (request_id, voter_id) VALUES ($1, $2)',
            [changeRequest.id, req.adminUser.id]
        );
        const approvals = await client.query(
            'SELECT COUNT(*)::integer AS count FROM admin_change_votes WHERE request_id = $1',
            [changeRequest.id]
        );
        const approvedCount = approvals.rows[0].count;
        let completed = false;
        if (approvedCount >= quorum) {
            if (changeRequest.action === 'downgrade') {
                await client.query('UPDATE admin_users SET is_super_admin = false WHERE id = $1', [changeRequest.target_user_id]);
            } else if (changeRequest.action === 'suspend') {
                await client.query('UPDATE admin_users SET suspended = true WHERE id = $1', [changeRequest.target_user_id]);
                await client.query('DELETE FROM admin_sessions WHERE user_id = $1', [changeRequest.target_user_id]);
            } else {
                await client.query('DELETE FROM admin_users WHERE id = $1', [changeRequest.target_user_id]);
            }
            await client.query(
                `UPDATE admin_change_requests SET status = 'approved', resolved_at = NOW() WHERE id = $1`,
                [changeRequest.id]
            );
            completed = true;
        }
        await client.query('COMMIT');
        res.json({ status: completed ? 'approved' : 'pending', approvals: approvedCount, quorum });
    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505') {
            return res.status(409).json({ error: 'You have already confirmed this request' });
        }
        console.error('Admin change vote failed:', error.message);
        res.status(500).json({ error: 'Unable to record admin change vote' });
    } finally {
        client.release();
    }
});

app.post('/api/admin/:id/approve', requireSuperAdmin, async (req, res) => {
    const result = await pool.query(
        `UPDATE admin_users
         SET approved = true
         WHERE id = $1
         RETURNING id, username, email, approved, is_super_admin`,
        [req.params.id]
    );
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Admin account not found' });
    }
    res.json(result.rows[0]);
});

app.post('/api/admin/:id/revoke', requireSuperAdmin, async (req, res) => {
    if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ error: 'You cannot revoke your own super admin access' });
    }
    const result = await pool.query(
        `UPDATE admin_users
         SET approved = false
         WHERE id = $1 AND is_super_admin = false
         RETURNING id, username, email, approved, is_super_admin AS "isSuperAdmin"`,
        [req.params.id]
    );
    if (!result.rows[0]) {
        return res.status(404).json({ error: 'Approved admin account not found' });
    }
    await pool.query('DELETE FROM admin_sessions WHERE user_id = $1', [req.params.id]);
    res.json(result.rows[0]);
});

app.delete('/api/admin/:id', requireSuperAdmin, async (req, res) => {
    if (req.params.id === req.adminUser.id) {
        return res.status(400).json({ error: 'You cannot remove your own super admin account' });
    }
    const result = await pool.query('DELETE FROM admin_users WHERE id = $1 AND is_super_admin = false RETURNING id', [req.params.id]);
    if (!result.rows[0]) {
        return res.status(409).json({ error: 'Super admin accounts require a quorum change request before deletion' });
    }
    res.status(204).end();
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
    const secureAttribute = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `legitways_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute}`);
    res.status(204).end();
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

app.get('/api/backups', requireSuperAdmin, async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await backupService.getStatus());
    } catch (error) {
        console.error('Unable to retrieve database backups:', error.message);
        res.status(502).json({ error: 'Unable to retrieve database backups. Check the server logs.' });
    }
});

app.post('/api/backups/run', requireSuperAdmin, async (req, res) => {
    if (!backupService.isConfigured()) {
        return res.status(503).json({ error: 'S3 backup storage is not configured.' });
    }
    try {
        const result = await backupService.runBackup();
        if (result.skipped) {
            return res.status(409).json({ error: 'A backup is already running on another server instance.' });
        }
        res.json(result);
    } catch (error) {
        console.error('Manual database backup failed:', error.message);
        res.status(502).json({ error: 'Database backup failed. Check the server logs.' });
    }
});

app.get('/api/backups/:id/download', requireSuperAdmin, async (req, res) => {
    try {
        const backup = await backupService.getBackup(req.params.id);
        res.set({
            'Cache-Control': 'private, no-store',
            'Content-Disposition': `attachment; filename="legitways-backup-${req.params.id}.json.gz"`,
            'Content-Type': 'application/gzip'
        });
        if (backup.ContentLength !== undefined) {
            res.set('Content-Length', String(backup.ContentLength));
        }
        await require('stream/promises').pipeline(backup.Body, res);
    } catch (error) {
        if (error.message === 'Invalid backup identifier.') {
            return res.status(400).json({ error: error.message });
        }
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
            return res.status(404).json({ error: 'Backup not found.' });
        }
        console.error('Unable to download database backup:', error.message);
        if (res.headersSent) {
            res.destroy(error);
            return;
        }
        res.status(502).json({ error: 'Unable to download database backup. Check the server logs.' });
    }
});

app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    next();
});

nextApp.prepare()
    .then(async () => {
        await initDatabase();
        try {
            backupService.start(pool);
        } catch (error) {
            console.error('Unable to initialize scheduled database backups:', error.message);
        }
    })
    .catch((error) => {
        console.error('Database unavailable; serving local blog data:', error.message);
    })
    .finally(() => {
        app.use((req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(404).json({ error: 'API route not found' });
            }

            return nextHandle(req, res);
        });

        app.listen(PORT, () => {
            console.log(`Server started on http://localhost:${PORT}`);
        });
    });
