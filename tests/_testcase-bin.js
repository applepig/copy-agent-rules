import path from 'path';
import fs from 'fs/promises';

export async function testBasicMergeAndOutputs(t) {
    t.log('basic: setup');
    const tmp_src = await t.mkTmpDir('car-src');
    const tmp_dest = await t.mkTmpDir('car-dest');

    await t.writeFile(path.join(tmp_src, 'a.md'), '# A\nHello');
    await t.writeFile(path.join(tmp_src, 'b.md'), '# B\nWorld');

    t.log('basic: run CLI');
    const { code } = await t.runCli([tmp_src, tmp_dest, '--formats', 'codex,cursor', '--overwrite']);
    t.log(`cli exit=${code}`);
    if (code !== 0) {
        throw new Error('CLI should exit 0');
    }

    const codex_path = path.join(tmp_dest, 'codex.md');
    const cursor_path = path.join(tmp_dest, '.cursor', 'rules', 'copy-agent-rule.mdc');

    const codex_exists = await fs.access(codex_path).then(() => true).catch(() => false);
    const cursor_exists = await fs.access(cursor_path).then(() => true).catch(() => false);

    await t.assert(codex_exists, 'codex.md should exist');
    await t.assert(cursor_exists, 'cursor file should exist');

    const codex_content = await t.readFile(codex_path);
    await t.assert(codex_content.includes('source: a.md'), 'merged should contain a.md marker');
    await t.assert(codex_content.includes('source: b.md'), 'merged should contain b.md marker');
    await t.assert(codex_content.includes('# A'), 'should contain A');
    await t.assert(codex_content.includes('# B'), 'should contain B');

    const cursor_content = await t.readFile(cursor_path);
    await t.assert(cursor_content.startsWith('---'), 'cursor content should include frontmatter prepend');
}

export async function testSingleFileSrc(t) {
    t.log('single file: setup');
    const tmp_dir = await t.mkTmpDir('car-single');
    const tmp_dest = await t.mkTmpDir('car-dest');
    const src_file = path.join(tmp_dir, 'single.md');
    await t.writeFile(src_file, '# One');

    t.log('single file: run CLI');
    const { code } = await t.runCli([src_file, tmp_dest, '--formats', 'codex', '--overwrite']);
    t.log(`cli exit=${code}`);
    if (code !== 0) {
        throw new Error('CLI should exit 0');
    }

    const codex_path = path.join(tmp_dest, 'codex.md');
    const codex_exists = await fs.access(codex_path).then(() => true).catch(() => false);
    await t.assert(codex_exists, 'codex.md should exist');

    const codex_content = await t.readFile(codex_path);
    await t.assert(codex_content.includes('# One'), 'should include file content');
    await t.assert(codex_content.includes('source: single.md'), 'should include source marker');
}

export async function testOverwriteFlag(t) {
    t.log('overwrite: setup');
    const tmp_src = await t.mkTmpDir('car-src');
    const tmp_dest = await t.mkTmpDir('car-dest');
    await t.writeFile(path.join(tmp_src, 'a.md'), 'one');

    const out_path = path.join(tmp_dest, 'codex.md');
    await t.writeFile(out_path, 'existing');

    t.log('overwrite: run without --overwrite (should prompt and skip in CI)');
    const r1 = await t.runCli([tmp_src, tmp_dest, '--formats', 'codex']);
    await t.assert(r1.code === 0 || r1.code === 1, 'CLI should not crash');
    const content1 = await t.readFile(out_path);
    await t.assert(content1 === 'existing', 'should not overwrite without --overwrite');

    t.log('overwrite: run with --overwrite');
    const r2 = await t.runCli([tmp_src, tmp_dest, '--formats', 'codex', '--overwrite']);
    await t.assert(r2.code === 0, 'exit 0');
    const content2 = await t.readFile(out_path);
    await t.assert(content2 !== 'existing', 'content should change after overwrite');
}

export async function testHelpOutput(t) {
    t.log('help: show formats list');
    const res = await t.runCli(['-h']);
    await t.assert(res.code === 0, 'help should exit 0');
    await t.assert(res.out.toLowerCase().includes('usage'), 'help should include Usage');
    await t.assert(res.out.toLowerCase().includes('available formats'), 'help should include formats list');
}

export async function testConfigFlag(t) {
    t.log('config flag: custom path');
    const tmp_src = await t.mkTmpDir('car-src');
    const tmp_dest = await t.mkTmpDir('car-dest');
    await t.writeFile(path.join(tmp_src, 'a.md'), '# A');

    const tmp_cfg_dir = await t.mkTmpDir('car-cfg');
    const cfg_path = path.join(tmp_cfg_dir, 'cfg.js');
    await t.writeFile(cfg_path, `export default {\n  overwrite: false,\n  formats: ['codex'],\n  formats_dict: { codex: { filename: 'from-config.md' } }\n};`);

    const res = await t.runCli([tmp_src, tmp_dest, '--config', cfg_path]);
    await t.assert(res.code === 0, 'cli exit 0');
    await t.assert(res.out.includes('using config from'), 'should log config path');
    await t.assert(res.out.includes(cfg_path), 'should show cfg path');

    const exists = await fs.access(path.join(tmp_dest, 'from-config.md')).then(() => true).catch(() => false);
    await t.assert(exists, 'should generate file from config');
}


