import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSettings, resolveDefaults, writeSetting } from '../src/settings.js';
import { parseArgs } from '../src/review.js';

const tmpFile = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'assayer-settings-')), 'config.json');
const quiet = { log: () => {}, save: () => { throw new Error('nothing should be saved'); } };

describe('defaults in ~/.assayer/config.json', () => {
  it('sets, validates and unsets a key, and keeps keys it does not know', () => {
    const f = tmpFile();
    writeFileSync(f, JSON.stringify({ future: 1 }));
    writeSetting('engine', 'claude-code', f);
    writeSetting('fail-on', 'major', f);
    assert.deepEqual(readSettings(f), { engine: 'claude-code', 'fail-on': 'major' });
    assert.throws(() => writeSetting('engine', 'nope', f), /engine takes/);
    assert.throws(() => writeSetting('colour', 'red', f), /unknown setting/);
    writeSetting('engine', undefined, f);
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { future: 1, 'fail-on': 'major' });
  });

  it('reads a missing file as empty, drops invalid values, and names a broken file', () => {
    assert.deepEqual(readSettings(tmpFile()), {});
    const f = tmpFile();
    writeFileSync(f, JSON.stringify({ engine: 'nope', model: 'gpt-6.1-sol' }));
    assert.deepEqual(readSettings(f), { model: 'gpt-6.1-sol' });
    writeFileSync(f, '{');
    assert.throws(() => readSettings(f), /not valid JSON/);
  });

  it('a flag beats the file, and a saved model rides only with the saved engine', async () => {
    const settings = { engine: 'claude-code', model: 'opus' };
    const fromFile = await resolveDefaults(parseArgs(['review', 'a/b#1']), { settings, isTTY: true, ...quiet });
    assert.deepEqual([fromFile.engine, fromFile.model], ['claude-code', 'opus']);
    const flag = await resolveDefaults(parseArgs(['review', 'a/b#1', '--engine', 'codex']), { settings, isTTY: true, ...quiet });
    assert.deepEqual([flag.engine, flag.model], ['codex', null]);
  });

  it('asks once on a terminal and saves the answer; never asks without one', async () => {
    const saved = [];
    const r = await resolveDefaults(parseArgs(['review', 'a/b#1']), {
      settings: {}, isTTY: true, pick: async () => 'opencode', save: (k, v) => saved.push([k, v]), log: () => {},
    });
    assert.equal(r.engine, 'opencode');
    assert.deepEqual(saved, [['engine', 'opencode']]);
    const ci = await resolveDefaults(parseArgs(['review', 'a/b#1']), { settings: {}, isTTY: false, pick: async () => assert.fail('asked'), ...quiet });
    assert.equal(ci.engine, 'codex');
  });

  it('fail-on from the file applies to a local round unless the flag is given', async () => {
    const settings = { 'fail-on': 'critical' };
    assert.equal((await resolveDefaults(parseArgs(['review']), { settings, isTTY: false, ...quiet })).failOn, 'critical');
    assert.equal((await resolveDefaults(parseArgs(['review', '--fail-on', 'minor']), { settings, isTTY: false, ...quiet })).failOn, 'minor');
  });

  it('parses assayer config', () => {
    assert.deepEqual(parseArgs(['config']), { cmd: 'config', action: 'show' });
    assert.deepEqual(parseArgs(['config', 'set', 'engine', 'codex']), { cmd: 'config', action: 'set', key: 'engine', value: 'codex' });
    assert.deepEqual(parseArgs(['config', 'unset', 'model']), { cmd: 'config', action: 'unset', key: 'model' });
    assert.throws(() => parseArgs(['config', 'set', 'colour', 'red']), /keys: engine, model, fail-on/);
  });
});
