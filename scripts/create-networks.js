const { execSync } = require('child_process');

const networks = ['tidb', 'frontend', 'kafka-consumer', 'kafka-producer'];

networks.forEach(name => {
    try {
        execSync(`docker network create ${name}`, { stdio: 'pipe' });
        console.log(`[networks] Created: ${name}`);
    } catch {
        console.log(`[networks] Already exists: ${name}`);
    }
});
