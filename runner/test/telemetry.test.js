import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { countBucket, createTelemetry, durationBucket, forcedOff, sanitize } from '../src/telemetry.js';
import { parseArgs } from '../src/review.js';

const DAY1 = new Date('2026-10-12T09:30:00Z');
const DAY2 = new Date('2026-10-13T10:00:00Z');

function harness({ env = {}, isTTY = true } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'assayer-tel-'));
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  const make = (at, tty = isTTY) => createTelemetry({ dir, env, fetchImpl, now: () => at, isTTY: tty, version: '0.1.0', log: () => {} });
  return { dir, sent, make };
}

describe('telemetry', () => {
  it('sends nothing on the run that shows the notice, then counts the install once a day', async () => {
    const h = harness();
    const first = h.make(DAY1);
    first.start();
    first.active();
    first.capture('round_finished', { engine: 'codex', conclusion: 'completed' });
    await first.flush();
    assert.equal(h.sent.length, 0);

    const later = h.make(new Date(DAY1.getTime() + 60_000));
    later.start();
    later.active();
    later.active();
    await later.flush();
    assert.deepEqual(h.sent.map((s) => s.body.event), ['install_active']);
    assert.equal(h.sent[0].url, 'https://eu.i.posthog.com/i/v0/e/');
    assert.equal(h.sent[0].body.timestamp, '2026-10-12T00:00:00.000Z');
    assert.equal(h.sent[0].body.properties.$geoip_disable, true);
    assert.equal(h.sent[0].body.properties.product, 'assayer');
    assert.equal(h.sent[0].body.properties.build, 'dev');

    const next = h.make(DAY2);
    next.active();
    await next.flush();
    assert.equal(h.sent.length, 2);
  });

  it('never starts without a terminal to show the notice on', async () => {
    const h = harness({ isTTY: false });
    for (const at of [DAY1, DAY2]) { const t = h.make(at); t.start(); t.active(); await t.flush(); }
    assert.equal(h.sent.length, 0);
  });

  it('ASSAYER_TELEMETRY=off, DO_NOT_TRACK and CI each beat a stored yes', async () => {
    assert.equal(forcedOff({ ASSAYER_TELEMETRY: 'off' }), true);
    assert.equal(forcedOff({ DO_NOT_TRACK: '1' }), true);
    assert.equal(forcedOff({ DO_NOT_TRACK: '0' }), false);
    assert.equal(forcedOff({ CI: 'true' }), true);
    assert.equal(forcedOff({}), false);
    const h = harness();
    h.make(DAY1).start();
    const forced = createTelemetry({ dir: h.dir, env: { CI: '1' }, fetchImpl: async () => h.sent.push(1), now: () => DAY2, isTTY: true, log: () => {} });
    forced.active();
    await forced.flush();
    assert.equal(h.sent.length, 0);
  });

  it('`telemetry off` stops sending, and status lists what was sent without the key', async () => {
    const h = harness();
    h.make(DAY1).start();
    const t = h.make(DAY2);
    t.capture('refused', { engine: 'codex', reason: 'closed' });
    await t.flush();
    assert.equal(h.sent.length, 1);
    const shown = JSON.parse(readFileSync(path.join(h.dir, 'telemetry-sent.json'), 'utf8'));
    assert.equal(shown[0].event, 'refused');
    assert.equal('api_key' in shown[0], false);
    assert.match(t.status(), /^telemetry: on/);
    t.set(false);
    const off = h.make(new Date(DAY2.getTime() + 1000));
    off.capture('refused', { engine: 'codex', reason: 'closed' });
    await off.flush();
    assert.equal(h.sent.length, 1);
    assert.match(off.status(), /^telemetry: off/);
  });

  it('drops any property or value outside the closed taxonomy', () => {
    assert.deepEqual(
      sanitize({ engine: 'codex', repo: 'acme/secret', reason: 'closed', conclusion: 'exploded', posted: false, node_major: 24.5, findings: '2-5' }),
      { engine: 'codex', reason: 'closed', posted: false, findings: '2-5' },
    );
    assert.deepEqual([0, 1, 3, 12, 40].map(countBucket), ['0', '1', '2-5', '6-20', '>20']);
    assert.deepEqual([5_000, 120_000, 600_000, 2_000_000].map(durationBucket), ['<1m', '1-5m', '5-15m', '>15m']);
  });

  it('parses `assayer telemetry on|off|status`', () => {
    assert.deepEqual(parseArgs(['telemetry', 'status']), { cmd: 'telemetry', action: 'status' });
    assert.throws(() => parseArgs(['telemetry', 'maybe']), /usage/);
  });
});
