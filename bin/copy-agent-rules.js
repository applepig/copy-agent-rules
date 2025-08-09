#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';
import readline from 'readline';

// DEBUG flag block (scoped logs)
const DEBUG_INFO = false;
function debugLog(message) {
    if (DEBUG_INFO) console.log(`[copy-agent-rules] ${message}`);
}

function showHelp(cfg) {
    const available = cfg && Array.isArray(cfg.formats)
        ? cfg.formats.join(', ')
        : 'Defined in config.js (formats array)';
    console.log(`
copy-agent-rules - Merge Markdown files and output to multiple IDE formats

Usage:
  copy-agent-rules <src_dir> <dest_dir> [--formats <list>] [--overwrite] [--config <file>]

Options:
  --formats <list>   Comma-separated formats to output (overrides config formats)
  --overwrite        Overwrite existing files without prompting (default: false)
  --config <file>    Use config from the given file (default: ./config.js)
  -h, --help         Show help

Available formats (from config.js):
  ${available}

Config sample (cwd/config.js):
  export default {
    overwrite: false,
    formats: ['chatgpt-codex','claude','cline','codex','cursor','gemini','kiro','vscode','windsurf'],
    formats_dict: {
      codex: { filename: 'codex.md' },
      cursor: { filename: '.cursor/rules/copy-agent-rule.mdc', prepend: '---\\n...' }
      // ...
    }
  }
`);
}

function parseArgs(argv) {
    const args = [];
    const options = { overwrite: false, formats: undefined, config: undefined };
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === '-h' || token === '--help') return { help: true };
        if (token === '--overwrite') { options.overwrite = true; continue; }
        if (token.startsWith('--formats=')) { options.formats = token.slice('--formats='.length); continue; }
        if (token === '--formats') { options.formats = argv[i + 1] || ''; i++; continue; }
        if (token.startsWith('--config=')) { options.config = token.slice('--config='.length); continue; }
        if (token === '--config') { options.config = argv[i + 1] || ''; i++; continue; }
        args.push(token);
    }
    return { args, options };
}

function isPlainObject(obj) { return obj && typeof obj === 'object' && !Array.isArray(obj); }

async function loadConfig(config_path) {
    debugLog('loadConfig: start');
    let cfg = { overwrite: false, formats: [], formats_dict: {} };
    const cfg_path = config_path || path.join(process.cwd(), 'config.js');
    try {
        const url = pathToFileURL(cfg_path).href;
        const mod = await import(url);
        const file_cfg = mod && (mod.default ?? mod.config ?? mod);
        if (isPlainObject(file_cfg)) cfg = file_cfg;
    } catch (e) {
        // Fallback: if the provided .js is outside an ESM package, import as data URL (always ESM)
        try {
            const raw = await fs.readFile(cfg_path, 'utf-8');
            const dataUrl = 'data:text/javascript;charset=utf-8,' + encodeURIComponent(raw);
            const mod2 = await import(dataUrl);
            const file_cfg2 = mod2 && (mod2.default ?? mod2.config ?? mod2);
            if (isPlainObject(file_cfg2)) cfg = file_cfg2;
        } catch (e2) {
            if (e.code !== 'ENOENT') console.warn(`⚠️  Failed to load config: ${e.message}`);
        }
    }
    if (!Array.isArray(cfg.formats)) throw new Error('config.formats must be an array');
    if (!isPlainObject(cfg.formats_dict)) throw new Error('config.formats_dict must be an object');
    debugLog('loadConfig: done');
    return { cfg, cfg_path };
}

function resolveFormats(config_formats, config_map, override_csv) {
    if (override_csv && String(override_csv).trim() !== '') {
        const wanted = override_csv.split(',').map(s => s.trim()).filter(Boolean);
        return wanted.filter(f => {
            if (!config_map[f]) { console.warn(`⚠️  Unknown format in --formats: ${f} (skipped)`); return false; }
            return true;
        });
    }
    return config_formats.filter(f => {
        if (!config_map[f]) { console.warn(`⚠️  Unknown format in config.formats: ${f} (skipped)`); return false; }
        return true;
    });
}

async function scanMarkdownFiles(source_dir) {
    const entries = await fs.readdir(source_dir).catch(err => {
        if (err && err.code === 'ENOENT') return null;
        throw err;
    });
    if (!entries) return [];
    return entries
        .filter(name => name.toLowerCase().endsWith('.md'))
        .map(name => path.join(source_dir, name))
        .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

async function readMergeMarkdown(file_paths) {
    debugLog('readMergeMarkdown: start');
    const parts = [];
    for (const file_path of file_paths) {
        try {
            const content = (await fs.readFile(file_path, 'utf-8')).trim();
            if (!content) { console.warn(`⚠️  Skip empty file: ${file_path}`); continue; }
            if (parts.length > 0) parts.push('');
            parts.push(`<!-- source: ${path.basename(file_path)} -->`);
            parts.push('');
            parts.push(content);
        } catch (e) {
            console.warn(`✗ Failed to read: ${file_path} - ${e.message}`);
        }
    }
    const merged = parts.join('\n') + '\n';
    debugLog('readMergeMarkdown: done');
    return merged;
}

async function ensureDirectory(dir_path) {
    const stat = await fs.stat(dir_path).catch(() => null);
    if (stat && !stat.isDirectory()) throw new Error(`Exists but not a directory: ${dir_path}`);
    if (!stat) await fs.mkdir(dir_path, { recursive: true });
}

async function fileExists(p) { try { await fs.access(p); return true; } catch { return false; } }

function askYesNo(question) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return Promise.resolve(false);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            const a = String(answer || '').trim().toLowerCase();
            resolve(a === 'y' || a === 'yes');
        });
    });
}

async function writeOutput(full_path, content, overwrite) {
    debugLog(`writeOutput: target=${full_path}`);
    if (!overwrite && await fileExists(full_path)) {
        const allow = await askYesNo(`File exists: ${full_path}. Overwrite? (y/N) `);
        if (!allow) {
            console.log(`⏭️  Skipped (use --overwrite to force): ${full_path}`);
            return { skipped: true };
        }
    }
    await fs.writeFile(full_path, content, 'utf-8');
    console.log(`✓ Wrote: ${full_path}`);
    return { skipped: false };
}

function buildContent(merged, per_format_prepend) {
    const p = (typeof per_format_prepend === 'string' && per_format_prepend.trim()) ? per_format_prepend.trim() + '\n\n' : '';
    return p + merged;
}

function resolveOutput(dest_dir, subpath, file_name) {
    const output_dir = subpath ? path.join(dest_dir, subpath) : dest_dir;
    return { output_dir, full_path: path.join(output_dir, file_name) };
}

async function run({ source_dir, dest_dir, formats_csv, overwrite_flag, config_path }) {
    console.log('🚀 Start');
    debugLog(`run: src=${source_dir}, dest=${dest_dir}, formats=${formats_csv || '(default)'}`);
    const { cfg, cfg_path } = await loadConfig(config_path);
    console.log(`using config from ${cfg_path}`);
    const enabled_formats = resolveFormats(cfg.formats || [], cfg.formats_dict || {}, formats_csv)
        .sort((a, b) => a.localeCompare(b));
    if (enabled_formats.length === 0) { console.warn('⚠️  No formats to output'); return { success: false }; }

    const files = await scanMarkdownFiles(source_dir);
    if (files.length === 0) { console.warn('⚠️  No .md files found in src'); return { success: false }; }
    const merged = await readMergeMarkdown(files);

    let outputs = 0;
    for (const fmt of enabled_formats) {
        const def = cfg.formats_dict[fmt];
        let output_dir, full_path;
        if (def.filename && typeof def.filename === 'string') {
            const rel = def.filename;
            const dirOfRel = path.dirname(rel);
            output_dir = dirOfRel === '.' ? dest_dir : path.join(dest_dir, dirOfRel);
            full_path = path.join(dest_dir, rel);
        } else {
            const subpath = def.subpath || '';
            const file_name = def.file_name || `${fmt}.md`;
            const resolved = resolveOutput(dest_dir, subpath, file_name);
            output_dir = resolved.output_dir;
            full_path = resolved.full_path;
        }
        await ensureDirectory(output_dir);
        const content = buildContent(merged, def.prepend);
        const res = await writeOutput(full_path, content, Boolean(overwrite_flag));
        if (!res.skipped) outputs++;
    }

    console.log(`\n✅ Done. Outputs: ${outputs}/${enabled_formats.length}`);
    return { success: outputs > 0 };
}

async function main() {
    const { args, options, help } = parseArgs(process.argv.slice(2));
    if (help) {
        let cfg_for_help = undefined;
        try { const r = await loadConfig(); cfg_for_help = r.cfg; } catch { }
        showHelp(cfg_for_help);
        process.exit(0);
    }
    if (!args || args.length < 2) {
        console.error('❌ Missing <src_dir> and <dest_dir>');
        showHelp();
        process.exit(1);
    }
    const [src, dest] = args;
    try {
        const res = await run({ source_dir: src, dest_dir: dest, formats_csv: options.formats, overwrite_flag: options.overwrite, config_path: options.config });
        process.exit(res.success ? 0 : 1);
    } catch (e) {
        console.error('❌ Failed:', e.message);
        process.exit(1);
    }
}

if (import.meta.url.startsWith('file:')) {
    main();
}


