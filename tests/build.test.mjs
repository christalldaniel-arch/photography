import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const project = fileURLToPath(new URL('../', import.meta.url));
const dependenciesAvailable = existsSync(path.join(project, 'node_modules/sass')) && existsSync(path.join(project, 'node_modules/terser'));
const imageMagickAvailable = spawnSync('convert', ['-version']).status === 0;
const skipBuild = !dependenciesAvailable && 'Run npm ci before integration tests';
const skipImages = skipBuild || (!imageMagickAvailable && 'Install ImageMagick before image tests');

if (process.env.CI && (skipBuild || skipImages)) {
    throw new Error('CI requires installed npm dependencies and ImageMagick; tests must not be skipped.');
}

function fixture(run) {
    const directory = mkdtempSync(path.join(tmpdir(), 'photography-build-'));
    try {
        return run(directory);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function runTask(directory, task) {
    return spawnSync(process.execPath, [path.join(project, 'scripts', task === 'resize' ? 'resize.mjs' : 'build.mjs')],
        { cwd: directory, encoding: 'utf8', timeout: 60000 });
}

function successful(result) {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

test('resize preserves the original and creates full-size and thumbnail outputs', { skip: skipImages }, () => fixture(directory => {
    const images = path.join(directory, 'images');
    mkdirSync(images);
    const original = path.join(images, 'source.png');
    successful(spawnSync('convert', ['-size', '1600x1200', 'xc:red', original], { encoding: 'utf8' }));
    const bytes = readFileSync(original);
    successful(runTask(directory, 'resize'));
    assert.deepEqual(readFileSync(original), bytes, 'Original image must remain intact');
    for (const [folder, width] of [['fulls', 1024], ['thumbs', 512]]) {
        const resized = path.join(images, folder, 'source.png');
        const dimensions = spawnSync('identify', ['-format', '%w', resized], { encoding: 'utf8' });
        successful(dimensions);
        assert.equal(Number(dimensions.stdout), width);
    }
}));

test('asset build compiles CSS and minifies JS without touching originals', { skip: skipBuild }, () => fixture(directory => {
    mkdirSync(path.join(directory, 'assets/sass'), { recursive: true });
    mkdirSync(path.join(directory, 'assets/js'), { recursive: true });
    mkdirSync(path.join(directory, 'images'));
    writeFileSync(path.join(directory, 'assets/sass/main.scss'), 'body { color: red; }');
    writeFileSync(path.join(directory, 'assets/js/main.js'), 'function double(value) { return value * 2; }');
    writeFileSync(path.join(directory, 'images/original.jpg'), 'untouched');
    successful(runTask(directory, 'default'));
    assert.match(readFileSync(path.join(directory, 'assets/css/main.min.css'), 'utf8'), /color:red/);
    assert.ok(readFileSync(path.join(directory, 'assets/js/main.min.js')).length > 0);
    assert.equal(readFileSync(path.join(directory, 'images/original.jpg'), 'utf8'), 'untouched');
}));

test('invalid Sass fails the build instead of reporting success', { skip: skipBuild }, () => fixture(directory => {
    mkdirSync(path.join(directory, 'assets/sass'), { recursive: true });
    writeFileSync(path.join(directory, 'assets/sass/main.scss'), 'body { color: ;');
    const result = runTask(directory, 'build');
    assert.ifError(result.error);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
}));
