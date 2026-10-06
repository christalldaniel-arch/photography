import { readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const tool = spawnSync('magick', ['-version']).status === 0 ? 'magick' : 'convert';
const available = spawnSync(tool, ['-version']);
if (available.status !== 0) throw new Error('ImageMagick is required for npm run resize.');

function convert(source, width, destination) {
    return new Promise((resolve, reject) => {
        const child = spawn(tool, [source, '-resize', width + 'x>', destination], { stdio: ['ignore', 'ignore', 'pipe'] });
        let errorOutput = '';
        child.stderr.on('data', chunk => { errorOutput += chunk; });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error('Resize failed for ' + source + ': ' + errorOutput));
        });
    });
}

const images = path.resolve('images');
const entries = await readdir(images, { withFileTypes: true });
const sources = entries.filter(entry => entry.isFile() && /\.(jpe?g|png|webp|tiff?|avif)$/i.test(entry.name));
for (const [folder, width] of [['fulls', 1024], ['thumbs', 512]]) {
    const destination = path.join(images, folder);
    await mkdir(destination, { recursive: true });
    for (const entry of sources) {
        await convert(path.join(images, entry.name), width, path.join(destination, entry.name));
        console.log('Resized ' + entry.name + ' to ' + folder);
    }
}
