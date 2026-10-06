import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as sass from 'sass';
import { minify } from 'terser';

async function files(directory, predicate) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const result = [];
    for (const entry of entries) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...await files(file, predicate));
        else if (entry.isFile() && predicate(entry.name)) result.push(file);
    }
    return result.sort();
}

const outputs = [];
for (const source of await files('assets/sass', name => name.endsWith('.scss') && !name.startsWith('_'))) {
    const result = await sass.compileAsync(source, { style: 'compressed' });
    const relative = path.relative('assets/sass', source).replace(/\.scss$/, '.min.css');
    outputs.push([path.join('assets/css', relative), result.css]);
}
for (const source of await files('assets/js', name => name.endsWith('.js') && !name.endsWith('.min.js'))) {
    const result = await minify(await readFile(source, 'utf8'));
    if (result.code === undefined) throw new Error('No minified output for ' + source);
    outputs.push([source.replace(/\.js$/, '.min.js'), result.code]);
}
// Compile everything before replacing any generated asset.
for (const [destination, content] of outputs) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
    console.log('Built ' + destination);
}
