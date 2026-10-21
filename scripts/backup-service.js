const {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client
} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const cron = require('node-cron');
const { gzip } = require('zlib');
const { promisify } = require('util');

const gzipAsync = promisify(gzip);

const BACKUP_TABLES = [
    'categories',
    'posts',
    'settings',
    'admin_users',
    'admin_change_requests',
    'admin_change_votes',
    'page_content',
    'page_content_change_requests'
];
const BACKUP_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/;
const BACKUP_LOCK_NAMESPACE = 692841;
const BACKUP_LOCK_ID = 1;

let pool;
let s3Client;
let schedule = '0 2 * * *';
let retentionCount = 30;
let backupPrefix = 'legitways/backups';
let running = false;
let lastError = null;

function isConfigured() {
    return Boolean(process.env.BACKUP_S3_BUCKET);
}

function getS3Client() {
    if (s3Client) {
        return s3Client;
    }

    const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
        throw new Error('BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY must be set together.');
    }

    s3Client = new S3Client({
        region: process.env.BACKUP_S3_REGION || 'us-east-1',
        ...(process.env.BACKUP_S3_ENDPOINT ? { endpoint: process.env.BACKUP_S3_ENDPOINT } : {}),
        ...(accessKeyId ? {
            credentials: {
                accessKeyId,
                secretAccessKey,
                ...(process.env.BACKUP_S3_SESSION_TOKEN
                    ? { sessionToken: process.env.BACKUP_S3_SESSION_TOKEN }
                    : {})
            }
        } : {}),
        forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true'
    });
    return s3Client;
}

function getBackupKey(id) {
    if (!BACKUP_ID_PATTERN.test(id)) {
        throw new Error('Invalid backup identifier.');
    }
    return `${backupPrefix}/legitways-backup-${id}.json.gz`;
}

async function listBackupObjects() {
    const objects = [];
    let continuationToken;

    do {
        const result = await getS3Client().send(new ListObjectsV2Command({
            Bucket: process.env.BACKUP_S3_BUCKET,
            Prefix: `${backupPrefix}/legitways-backup-`,
            ContinuationToken: continuationToken
        }));
        for (const object of result.Contents || []) {
            const match = object.Key?.match(/\/legitways-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8})\.json\.gz$/);
            if (match && BACKUP_ID_PATTERN.test(match[1])) {
                objects.push({
                    id: match[1],
                    key: object.Key,
                    createdAt: object.LastModified?.toISOString() || null,
                    size: object.Size || 0
                });
            }
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return objects.sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));
}

async function removeExpiredBackups(objects) {
    const expired = objects.slice(retentionCount);
    for (let index = 0; index < expired.length; index += 1000) {
        await getS3Client().send(new DeleteObjectsCommand({
            Bucket: process.env.BACKUP_S3_BUCKET,
            Delete: {
                Quiet: false,
                Objects: expired.slice(index, index + 1000).map(object => ({ Key: object.key }))
            }
        })).then(result => {
            if (result.Errors?.length) {
                throw new Error(`Unable to delete ${result.Errors.length} expired S3 backup object(s).`);
            }
        });
    }
}

async function createBackup() {
    const client = await pool.connect();
    let hasLock = false;
    let transactionOpen = false;

    try {
        const lockResult = await client.query(
            'SELECT pg_try_advisory_lock($1, $2) AS locked',
            [BACKUP_LOCK_NAMESPACE, BACKUP_LOCK_ID]
        );
        hasLock = lockResult.rows[0].locked;
        if (!hasLock) {
            return { skipped: true };
        }

        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        transactionOpen = true;
        const tables = {};
        for (const table of BACKUP_TABLES) {
            const result = await client.query(`SELECT * FROM "${table}"`);
            tables[table] = result.rows;
        }
        await client.query('COMMIT');
        transactionOpen = false;

        const createdAt = new Date().toISOString();
        const id = `${createdAt.replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}`;
        const backup = {
            formatVersion: 1,
            createdAt,
            tables
        };
        const body = await gzipAsync(Buffer.from(JSON.stringify(backup)));
        const key = getBackupKey(id);

        await getS3Client().send(new PutObjectCommand({
            Bucket: process.env.BACKUP_S3_BUCKET,
            Key: key,
            Body: body,
            ContentType: 'application/json',
            ContentEncoding: 'gzip',
            ServerSideEncryption: 'AES256'
        }));

        const objects = await listBackupObjects();
        await removeExpiredBackups(objects);
        return {
            id,
            createdAt,
            size: body.length,
            tables: Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length]))
        };
    } catch (error) {
        if (transactionOpen) {
            await client.query('ROLLBACK');
        }
        throw error;
    } finally {
        let releaseClient = true;
        try {
            if (hasLock) {
                await client.query('SELECT pg_advisory_unlock($1, $2)', [BACKUP_LOCK_NAMESPACE, BACKUP_LOCK_ID]);
            }
        } catch (error) {
            releaseClient = false;
            throw error;
        } finally {
            client.release(releaseClient);
        }
    }
}

async function runBackup() {
    if (!pool || !isConfigured()) {
        throw new Error('Database backups are not configured.');
    }
    if (running) {
        return { skipped: true };
    }

    running = true;
    try {
        const result = await createBackup();
        if (!result.skipped) {
            lastError = null;
            console.log(`Database backup uploaded: ${result.id}`);
        }
        return result;
    } catch (error) {
        lastError = error.message;
        throw error;
    } finally {
        running = false;
    }
}

function start(databasePool) {
    pool = databasePool;
    if (!isConfigured()) {
        console.error('Scheduled database backups are disabled: BACKUP_S3_BUCKET is not configured.');
        return;
    }

    let configuredSchedule;
    let configuredRetention;
    let configuredPrefix;
    try {
        configuredSchedule = process.env.BACKUP_SCHEDULE_CRON || '0 2 * * *';
        if (!cron.validate(configuredSchedule)) {
            throw new Error('BACKUP_SCHEDULE_CRON must be a valid cron expression.');
        }
        configuredRetention = Number(process.env.BACKUP_RETENTION_COUNT || 30);
        if (!Number.isSafeInteger(configuredRetention) || configuredRetention < 1) {
            throw new Error('BACKUP_RETENTION_COUNT must be a positive integer.');
        }
        configuredPrefix = String(process.env.BACKUP_S3_PREFIX || 'legitways/backups')
            .replace(/^\/+|\/+$/g, '')
            .replace(/\/+/g, '/');
        getS3Client();
    } catch (error) {
        lastError = error.message;
        console.error('Scheduled database backups are disabled:', error.message);
        return;
    }

    schedule = configuredSchedule;
    retentionCount = configuredRetention;
    backupPrefix = configuredPrefix;
    cron.schedule(schedule, async () => {
        try {
            const result = await runBackup();
            if (result.skipped) {
                console.log('Scheduled database backup skipped because another instance holds the backup lock.');
            }
        } catch (error) {
            console.error('Scheduled database backup failed:', error.message);
        }
    }, { timezone: 'UTC' });

    console.log(`Scheduled S3 database backups enabled (UTC cron: ${schedule}; retaining ${retentionCount}).`);
}

async function getStatus() {
    if (!isConfigured()) {
        return {
            configured: false,
            schedule: schedule || process.env.BACKUP_SCHEDULE_CRON || '0 2 * * *',
            retentionCount: Number(process.env.BACKUP_RETENTION_COUNT || 30),
            running,
            lastError
        };
    }
    const backups = await listBackupObjects();
    return {
        configured: true,
        schedule: schedule || process.env.BACKUP_SCHEDULE_CRON || '0 2 * * *',
        retentionCount: retentionCount || Number(process.env.BACKUP_RETENTION_COUNT || 30),
        running,
        lastError,
        backups: backups.slice(0, retentionCount || 30).map(({ id, createdAt, size }) => ({ id, createdAt, size }))
    };
}

async function getBackup(id) {
    if (!isConfigured()) {
        throw new Error('Database backups are not configured.');
    }
    return getS3Client().send(new GetObjectCommand({
        Bucket: process.env.BACKUP_S3_BUCKET,
        Key: getBackupKey(id)
    }));
}

module.exports = {
    getBackup,
    getStatus,
    isConfigured,
    runBackup,
    start
};
