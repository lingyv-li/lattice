import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Optional target argument, effectively ignored for now or just used for naming if key provided
const target = process.argv[2] || 'extension';

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
const version = packageJson.version;
const name = packageJson.name;
const distDir = path.join(__dirname, '../dist');
const releasesDir = path.join(__dirname, '../releases');

if (!fs.existsSync(releasesDir)) {
    fs.mkdirSync(releasesDir);
}

const zipPath = path.join(releasesDir, `${name}-v${version}.zip`);
const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', {
    zlib: { level: 9 }
});

output.on('close', function () {
    console.log(`✓ Packed extension: ${zipPath} (${archive.pointer()} bytes)`);
});

archive.on('warning', function (err) {
    if (err.code === 'ENOENT') {
        console.warn(err);
    } else {
        throw err;
    }
});

archive.on('error', function (err) {
    throw err;
});

archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();
