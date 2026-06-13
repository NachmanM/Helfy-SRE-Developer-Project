const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function setupDatabase() {
    const DB_NAME = process.env.DB_NAME || 'app_dev_db';
    const connConfig = {
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 4000,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        multipleStatements: true
    };

    const maxRetries = 20;
    const retryDelay = 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let connection;
        try {
            connection = await mysql.createConnection(connConfig);
            const schemaPath = path.join(__dirname, 'schema.sql');
            let sql = fs.readFileSync(schemaPath, 'utf8');
            sql = sql.replace(/{{DB_NAME}}/g, DB_NAME);

            console.log("Importing schema...");
            await connection.query(sql);
            console.log("Schema imported successfully.");
            return;
        } catch (error) {
            console.error(`Database setup attempt ${attempt}/${maxRetries} failed:`, error.message);
            if (attempt === maxRetries) throw error;
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        } finally {
            if (connection) await connection.end().catch(() => {});
        }
    }
}

module.exports = setupDatabase;