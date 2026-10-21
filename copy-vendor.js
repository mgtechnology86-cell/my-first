// Copies the Supabase browser library next to the app so the site also works offline / inside the Android app.
const fs = require('fs'), path = require('path');
const from = path.join(__dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const to = path.join(__dirname, '..', 'assets', 'js', 'vendor', 'supabase.js');
try { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); console.log('Copied Supabase library to assets/js/vendor/'); }
catch (e) { console.log('Skipped copying Supabase library (the CDN copy will be used):', e.message); }
