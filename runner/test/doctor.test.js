import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doctor, formatDoctor } from '../src/doctor.js';
import { parseArgs } from '../src/review.js';

const VERSIONS = { git: 'git version 2.55.0', python3: 'Python 3.12.3', gh: 'gh version 2.81.0', codex: 'codex-cli 0.162.1', claude: '2.3.1 (Claude Code)', opencode: '1.18.30' };

function machine(installed, { signedIn = true } = {}) {
  return {
    which: (cmd) => (installed.includes(cmd) ? `/usr/bin/${cmd}` : null),
    probe: (cmd, args) => (args[0] === 'auth' ? { ok: signedIn, out: '' } : { ok: true, out: VERSIONS[cmd] ?? '' }),
    nodeVersion: '24.21.0',
  };
}

describe('doctor', () => {
  it('is ready with the tools, a GitHub sign-in and one whole engine', () => {
    const d = doctor(machine(['git', 'python3', 'gh', 'codex', 'codex-acp']));
    assert.equal(d.ok, true);
    assert.equal(d.checks.find((c) => c.name === 'engine codex').detail, 'codex 0.162.1');
    assert.match(d.checks.find((c) => c.name === 'engine claude-code').detail, /missing claude and claude-agent-acp/);
    assert.match(formatDoctor(d), /ready: assayer review can run here/);
  });

  it('is not ready without an adapter, without gh sign-in, or on an old Node', () => {
    assert.equal(doctor(machine(['git', 'python3', 'gh', 'codex'])).ok, false);
    assert.equal(doctor(machine(['git', 'python3', 'gh', 'opencode'], { signedIn: false })).ok, false);
    assert.equal(doctor({ ...machine(['git', 'python3', 'gh', 'opencode']), nodeVersion: '22.11.0' }).ok, false);
  });

  it('notes a version other than the admitted one, and never blocks on it', () => {
    VERSIONS.opencode = '1.19.0';
    const d = doctor(machine(['git', 'python3', 'gh', 'opencode']));
    assert.equal(d.ok, true);
    assert.equal(d.checks.find((c) => c.name === 'engine opencode').detail, 'opencode 1.19.0; tested on 1.18.30');
  });

  it('parses `assayer doctor` and `assayer --version`', () => {
    assert.deepEqual(parseArgs(['doctor']), { cmd: 'doctor' });
    assert.deepEqual(parseArgs(['--version']), { cmd: '--version' });
    assert.throws(() => parseArgs(['doctor', 'extra']), /usage/);
  });
});
