const express = require('express');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const log4js = require('log4js');
const setupDatabase = require('./db-setup');

log4js.configure({
    appenders: {
        console: {
            type: 'stdout',
            layout: { type: 'pattern', pattern: '%m' }
        }
    },
    categories: {
        default: { appenders: ['console'], level: 'info' }
    }
});
const logger = log4js.getLogger('api');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

async function init() {
    await setupDatabase();

    const app = express();
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../frontend')));

    app.set('trust proxy', true);

    const pool = await mysql.createPool({
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 4000,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'app_dev_db',
        waitForConnections: true,
        connectionLimit: 10
    });

    logger.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        action: 'database_pool_initialized',
        message: 'Database connection pool established.'
    }));

    async function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Token missing' });
        }

        try {
            const [rows] = await pool.execute(
                'SELECT user_id FROM user_tokens WHERE token_value = ?',
                [token]
            );

            if (rows.length === 0) {
                return res.status(403).json({ error: 'Invalid or expired token' });
            }

            req.userId = rows[0].user_id;
            next();
        } catch (err) {
            logger.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                action: 'token_verification_failed',
                error: err.message
            }));
            return res.status(500).json({ error: 'Database verification error' });
        }
    }

    app.post('/api/login', async (req, res) => {
        const { username, password } = req.body;
        const clientIp = req.ip || req.socket.remoteAddress;

        if (!username || !password) {
            logger.warn(JSON.stringify({
                timestamp: new Date().toISOString(),
                userId: null,
                action: 'login_failed_malformed_payload',
                ip: clientIp
            }));
            return res.status(400).json({ error: 'Username and password are required' });
        }

        try {
            const [users] = await pool.execute(
                'SELECT id, password_hash FROM users WHERE username = ?',
                [username]
            );

            if (users.length === 0 || users[0].password_hash !== hashPassword(password)) {
                logger.warn(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    userId: null,
                    action: 'login_failed_invalid_credentials',
                    ip: clientIp
                }));
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const userId = users[0].id;
            const token = crypto.randomBytes(32).toString('hex');

            await pool.execute(
                'INSERT INTO user_tokens (user_id, token_value) VALUES (?, ?)',
                [userId, token]
            );

            logger.info(JSON.stringify({
                timestamp: new Date().toISOString(),
                userId: userId,
                action: 'login_success',
                ip: clientIp
            }));

            return res.json({ token: token });
        } catch (error) {
            logger.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                action: 'login_runtime_error',
                error: error.message
            }));
            return res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.get('/api/verify-token', authenticateToken, async (req, res) => {
        try {
            const [users] = await pool.execute(
                'SELECT username FROM users WHERE id = ?',
                [req.userId]
            );
            res.json({
                message: 'Authentication successful',
                userId: req.userId,
                username: users[0].username
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch user profile' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        logger.info(JSON.stringify({
            timestamp: new Date().toISOString(),
            action: 'server_started',
            port: PORT
        }));
    });
}

if (require.main === module) {
    init().catch(() => process.exit(1));
}

module.exports = { init };
