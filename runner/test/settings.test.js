import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

describe('ASSAYER_HOME', () => {
  it('moves only Assayer state', async () => {
    const { assayerHome } = await import('../src/settings.js');
    assert.equal(assayerHome({ ASSAYER_HOME: '/x/state' }), '/x/state');
    assert.equal(assayerHome({}), path.join(os.homedir(), '.assayer'));
  });
});

describe('PR reviews and kept rounds', () => {
  it('a PR review takes --fail-on, and the saved fail-on too', async () => {
    assert.equal(parseArgs(['review', 'a/b#1', '--fail-on', 'major']).failOn, 'major');
    assert.throws(() => parseArgs(['review', 'a/b#1', '--fail-on', 'loud']), /--fail-on takes/);
    assert.equal((await resolveDefaults(parseArgs(['review', 'a/b#1', '--engine', 'codex']), { settings: { 'fail-on': 'critical' }, isTTY: false, ...quiet })).failOn, 'critical');
  });

  it('publish finds a bare round name among the kept rounds', async () => {
    const { roundDir } = await import('../src/review.js');
    const home = mkdtempSync(path.join(os.tmpdir(), 'assayer-home-'));
    mkdirSync(path.join(home, 'reviews', 'o-r-1-abc-1'), { recursive: true });
    assert.equal(roundDir('o-r-1-abc-1', home), path.join(home, 'reviews', 'o-r-1-abc-1'));
    assert.equal(roundDir('/abs/elsewhere', home), '/abs/elsewhere');
  });
});

describe('help', () => {
  it('--help, -h and help ask for help anywhere; a bare assayer stays a usage error', () => {
    for (const a of [['--help'], ['-h'], ['help'], ['review', '--help'], ['review', 'a/b#1', '-h']]) assert.deepEqual(parseArgs(a), { cmd: 'help' }, a.join(' '));
    assert.throws(() => parseArgs([]), /usage:/);
  });
});
