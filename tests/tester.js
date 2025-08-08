#!/usr/bin/env node

// DEBUG flag block (scoped logs)
const DEBUG_INFO = false;
function debugLog(message) {
    if (DEBUG_INFO) console.log(`[tests] ${message}`);
}

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

class Tester {
    constructor() {
        this.failed = false;
    }

    log(message) {
        console.log(`[test] ${message}`);
    }

    async assert(condition, message) {
        if (!condition) throw new Error(message);
    }

    async mkTmpDir(prefix) {
        // lazy import to keep dependencies minimal in constructor
        const os = await import('os');
        const dir = await fs.mkdtemp(path.join(os.default.tmpdir(), `${prefix}-`));
        return dir;
    }

    async writeFile(file_path, content) {
        await fs.mkdir(path.dirname(file_path), { recursive: true });
        await fs.writeFile(file_path, content, 'utf-8');
    }

    async readFile(file_path) {
        return fs.readFile(file_path, 'utf-8');
    }

    runCli(args, opts = {}) {
        return new Promise((resolve, reject) => {
            const child = spawn(process.execPath, ['bin/copy-agent-rules.js', ...args], {
                stdio: ['ignore', 'pipe', 'pipe'],
                ...opts
            });
            let out = '';
            let err = '';
            child.stdout.on('data', d => { out += d.toString(); });
            child.stderr.on('data', d => { err += d.toString(); });
            child.on('error', reject);
            child.on('close', code => resolve({ code, out, err }));
        });
    }

    isPlainObject(obj) {
        return obj && typeof obj === 'object' && !Array.isArray(obj);
    }
}

import { testConfigLoadAndValidate } from './_testcase-config.js';
import { testBasicMergeAndOutputs, testOverwriteFlag, testHelpOutput } from './_testcase-bin.js';

async function main() {
    const t = new Tester();
    try {
        await testConfigLoadAndValidate(t);
        await testBasicMergeAndOutputs(t);
        await testOverwriteFlag(t);
        await testHelpOutput(t);
        t.log('All tests passed.');
    } catch (e) {
        console.error('Test failed:', e.message);
        process.exit(1);
        return;
    }
    process.exit(0);
}

main();


