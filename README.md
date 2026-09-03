# CarnegienFreedom

Education-first guidance for safer opportunities, scam awareness, practical learning, and smarter decisions.

## About This Repository

This repository contains the CarnegienFreedom website and its dynamic blog management system. The public experience uses static HTML, CSS, and vanilla JavaScript. Blog content is served through an Express API backed by PostgreSQL, with a local JSON fallback for public read operations when the database is unavailable.

## Features

- Responsive public website and educational resource pages
- PostgreSQL-backed blog with categories, search, featured posts, tags, and related articles
- Protected admin panel for creating, editing, previewing, importing, exporting, and deleting posts
- Email delivery of the downloadable educational guide
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
ALLOWED_ORIGINS=http://localhost:3000
ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_EMAIL=admin@example.com
ADMIN_BOOTSTRAP_PASSWORD=replace-with-a-long-password
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=mailer@example.com
SMTP_PASSWORD=replace-with-an-app-password
SMTP_FROM=mailer@example.com
```

For production, use managed secrets, `NODE_ENV=production`, `DB_SSL=true`, and set `ALLOWED_ORIGINS` to the exact HTTPS origins that should call the API.

## Routes

- `/` - public homepage
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

## Deployment

The included [render.yaml](render.yaml) defines a Node web service. Configure the production database and SMTP variables in Render's secret environment settings, then deploy with:

```bash
npm install
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
