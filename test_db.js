const db = require('better-sqlite3')('database.sqlite');
try {
    db.prepare("UPDATE rooms SET leader_id = '' WHERE leader_id = 'test'").run();
    console.log('success');
} catch(e) {
    console.error(e);
}
