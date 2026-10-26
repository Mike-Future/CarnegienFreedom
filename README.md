# CarnegienFreedom

Education-first guidance for safer opportunities, scam awareness, practical learning, and smarter decisions.

## About This Repository

This repository contains the CarnegienFreedom website and its dynamic blog management system. Next.js serves the route shell and statically renders the stable informational pages, while the blog and admin experiences load live data through the Express API backed by PostgreSQL. Public blog reads fall back to local JSON when the database is unavailable.

## Features

- Responsive public website and educational resource pages
- PostgreSQL-backed blog with categories, search, featured posts, tags, and related articles
- Protected admin panel for creating, editing, previewing, importing, exporting, and deleting posts
- Daily compressed PostgreSQL data backups to private S3-compatible object storage, with admin status, on-demand snapshots, downloads, and configurable retention
- Super admin approval workflow for new admin accounts
- Super admins can propose changes to individual sections on every public page except the blog and its articles; each section change needs approval from a different super admin
- Direct download of the educational guide without email collection
- Cookie consent banner and cookie preferences
- Privacy Policy, Cookie Policy, Terms of Use, and disclaimer pages
- Helmet security headers and Content Security Policy
- CORS origin allowlist and endpoint rate limiting
- Bcrypt password hashing and HttpOnly SameSite admin sessions
- Docker Compose configuration for local PostgreSQL
- Render deployment configuration

## Quick Start

### Requirements

- Node.js 18 or newer
- npm
- Docker Desktop for local PostgreSQL

### Install and run

```bash
npm install
npm run db:start
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Stop the local database with:

```bash
npm run db:stop
```

## Environment Variables

Create a local `.env` file and keep it out of version control:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://legitways:legitways_local_password@localhost:5432/legitways
DB_SSL=false
DB_CONNECTION_TIMEOUT_MS=5000
ALLOWED_ORIGINS=http://localhost:3000
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-with-a-long-password
BACKUP_S3_BUCKET=your-private-backup-bucket
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY_ID=your-backup-access-key
BACKUP_S3_SECRET_ACCESS_KEY=your-backup-secret-key
```

Configure the S3 bucket and credentials as managed secrets in production. For S3-compatible storage, set `BACKUP_S3_ENDPOINT`; for providers that require path-style addressing, also set `BACKUP_S3_FORCE_PATH_STYLE=true`. `BACKUP_S3_PREFIX` defaults to `legitways/backups`. `BACKUP_SCHEDULE_CRON` defaults to `0 2 * * *` (02:00 UTC daily), and `BACKUP_RETENTION_COUNT` defaults to `30`. Backups are compressed and sent with S3 server-side encryption. The backup access key needs list, put, get, and delete access limited to the configured bucket/prefix. Without `BACKUP_S3_BUCKET`, scheduled backups remain disabled and the server logs this explicitly.

For production, use managed secrets, `NODE_ENV=production`, `DB_SSL=true`, and set `ALLOWED_ORIGINS` to the exact HTTPS origins that should call the API.
The web server starts even if PostgreSQL is temporarily unreachable. Public blog pages then fall back to the bundled `data/blog-data.json`; admin login and editing require PostgreSQL to recover. `DB_CONNECTION_TIMEOUT_MS` controls how long each database connection attempt waits (default `5000`).

## External Additions Required

The website runs without these services in read-only fallback mode, but they are required for the complete dynamic experience:

- PostgreSQL 16: required for live blog updates, admin authentication, and publishing. Use `npm run db:start` locally or provide `DATABASE_URL` in production.
- Production environment variables: set `DATABASE_URL`, `DB_SSL=true`, `ALLOWED_ORIGINS`, and optional `ADMIN_BOOTSTRAP_*` values in the hosting provider's secret settings.
- Google Fonts and Font Awesome CDN: used by the existing visual design. Self-host these assets if the deployment must avoid third-party requests.
- Unsplash: current article and homepage images use external Unsplash URLs. Replace them with local files if external image delivery is not desired.
- Docker Desktop: only needed for the local PostgreSQL container, not for production.

## Routes

- `/` - public homepage
- `/about` - team and organization information
- `/blog` - blog listing
- `/blog-post?slug=...` - article page
- `/admin` - admin panel
- `/about.html` - team and organization information
- `/blog.html` - blog listing
- `/blog-post.html?slug=...` - article page
- `/admin.html` - admin panel
- `/privacy-policy.html` - privacy policy
- `/cookie-policy.html` - cookie policy
- `/terms-of-use.html` - terms of use

## Blog Administration

1. Open `/admin.html`.
2. Log in with an admin account.
3. Create or edit posts from the admin panel.
4. Preview content before publishing.
5. Export data before bulk imports or destructive changes.

The first server startup can create an admin account when the database is empty and valid `ADMIN_BOOTSTRAP_*` variables are supplied.

## API Overview

Public endpoints include:

- `GET /api/health`
- `GET /api/posts`
- `GET /api/posts/slug/:slug`
- `GET /api/posts/category/:category`
- `GET /api/posts/featured`
- `GET /api/posts/search?q=term`
- `GET /api/categories`
- `GET /api/data/export`

Protected operations include authentication, post writes, category writes, settings writes, imports, deletes, and database clearing. See [WEBSITE_DOCUMENTATION.md](WEBSITE_DOCUMENTATION.md) for the complete request reference.

Super-admin-only backup operations include `GET /api/backups` (status and list), `POST /api/backups/run` (create an on-demand snapshot), and `GET /api/backups/:id/download` (download a compressed archive).

## Deployment

The included [render.yaml](render.yaml) defines a Node web service. Configure the production database and SMTP variables in Render's secret environment settings, then deploy with:

```bash
npm install
npm run build
npm start
```

The service uses the port supplied by the hosting platform.

## Validation

Run these checks before deployment:

```bash
node --check server.js
node --check scripts/script.js
node --check scripts/blog.js
node --check scripts/blog-post.js
node --check scripts/admin.js
npm run build
npm audit --omit=dev --audit-level=high
```

## Documentation

- [Complete website documentation](WEBSITE_DOCUMENTATION.md)
- [Historical blog notes](BLOG_README.md)
- [Historical dynamic-system notes](DYNAMIC_SYSTEM_README.md)

The two historical documents describe earlier versions of the project. The complete documentation reflects the current Express/PostgreSQL implementation.

## Privacy and Legal

The website includes separate privacy and cookie policies. These pages describe the intended behavior of the site and should be reviewed by qualified legal counsel before use in a specific jurisdiction or regulated context.

## License

No license is currently specified for this repository. Add an appropriate license before distributing or accepting external contributions.
