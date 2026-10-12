import { it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { checkout } from '../src/github.js';

it('checks out with the token only in GIT_CONFIG_VALUE_0, never in argv', async () => {
  const spawned = [];
  const spawn = (cmd, args, opts) => {
    spawned.push({ cmd, args, env: opts.env });
    const child = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', 0));
    return child;
  };
  await checkout({ repository: 'o/r', headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40), token: 'ghs_secret', dir: '/tmp/x', spawn });
  assert.deepEqual(spawned.map((s) => s.args[0]), ['init', 'fetch', 'checkout']);
  for (const s of spawned) {
    assert.doesNotMatch(s.args.join(' '), /ghs_secret/);
    assert.equal(s.env.GIT_CONFIG_KEY_0, 'http.https://github.com/.extraheader');
    assert.equal(s.env.GIT_CONFIG_VALUE_0, `AUTHORIZATION: basic ${Buffer.from('x-access-token:ghs_secret').toString('base64')}`);
    assert.deepEqual(Object.keys(s.env).sort(), ['GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_TERMINAL_PROMPT', 'HOME', 'PATH']);
  }
  assert.deepEqual(spawned[1].args.slice(-2), ['a'.repeat(40), 'b'.repeat(40)]);
});
