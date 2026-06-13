// backend/cdc-consumer.js
const { Kafka } = require('kafkajs');
const log4js = require('log4js');

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
const logger = log4js.getLogger('cdc-processor');

const kafkaHost = process.env.KAFKA_BOOTSTRAP_SERVER || 'kafka:9092';
const kafka = new Kafka({
    clientId: 'tidb-cdc-processor',
    brokers: [kafkaHost]
});

const consumer = kafka.consumer({ groupId: 'cdc-logging-group' });

async function startConsumer() {
    const maxRetries = 12;
    const retryDelay = 10000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[CDC Consumer] Connecting to Kafka broker at ${kafkaHost}...`);
            await consumer.connect();

            await consumer.subscribe({ topic: 'db-mutations', fromBeginning: false });
            console.log(`[CDC Consumer] Subscribed to "db-mutations". Monitoring mutations...`);

            await consumer.run({
                eachMessage: async ({ topic, partition, message }) => {
                    try {
                        const rawValue = message.value.toString();
                        const cdcData = JSON.parse(rawValue);

                        if (cdcData.isDdl) return;

                        const processedLog = {
                            timestamp: new Date(cdcData.ts || Date.now()).toISOString(),
                            database: cdcData.database,
                            table: cdcData.table,
                            action: cdcData.type,
                            payload: cdcData.data,
                            precedingState: cdcData.old
                        };

                        logger.info(JSON.stringify(processedLog));

                    } catch (parseError) {
                        logger.error(JSON.stringify({
                            timestamp: new Date().toISOString(),
                            action: 'cdc_message_processing_failed',
                            error: parseError.message
                        }));
                    }
                }
            });

            return;

        } catch (error) {
            if (error.type === 'UNKNOWN_TOPIC_OR_PARTITION' && attempt < maxRetries) {
                console.log(`[CDC Consumer] Topic not ready, retrying in ${retryDelay / 1000}s... (${attempt}/${maxRetries})`);
                await consumer.disconnect().catch(() => {});
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                console.error('[CDC Consumer] Fatal runtime processing initialization error:', error);
                process.exit(1);
            }
        }
    }
}

const crashFramework = async () => {
    console.log('\n[CDC Consumer] Cleaning network sockets...');
    await consumer.disconnect();
    process.exit(0);
};
process.on('SIGTERM', crashFramework);
process.on('SIGINT', crashFramework);

startConsumer();