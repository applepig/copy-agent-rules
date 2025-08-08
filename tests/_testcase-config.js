import path from 'path';
import { pathToFileURL } from 'url';

export async function testConfigLoadAndValidate(t) {
    t.log('config: load and validate');
    const cfg_path = path.join(process.cwd(), 'config.js');
    let mod;
    try {
        mod = await import(pathToFileURL(cfg_path).href);
    } catch (e) {
        throw new Error(`config.js failed to load (syntax error?): ${e.message}`);
    }

    const cfg = mod && (mod.default ?? mod.config ?? mod);
    await t.assert(t.isPlainObject(cfg), 'config should export an object');

    await t.assert(Array.isArray(cfg.formats), 'config.formats should be an array');
    await t.assert(t.isPlainObject(cfg.formats_dict), 'config.formats_dict should be an object');

    for (const [name, def] of Object.entries(cfg.formats_dict)) {
        await t.assert(t.isPlainObject(def), `formats_dict.${name} should be an object`);
        await t.assert(typeof def.filename === 'string' && def.filename.trim() !== '', `formats_dict.${name}.filename must be a non-empty string`);
    }
}


