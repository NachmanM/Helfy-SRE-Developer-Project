const { init } = require('./main-app-layout');

init().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
