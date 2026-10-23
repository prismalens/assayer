// The shallow checkout a round reviews, fetched with the user's own gh token (#184).
import { spawn as nodeSpawn } from 'node:child_process';

function run(spawn, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error((stderr.split('\n').find((l) => l.trim()) ?? `git ${args[0]} exited ${code}`).trim()));
    });
  });
}

// Symlinks check out as plain files holding their target, so no engine can follow a link the
// pull request adds out of the checkout (an OpenCode canary read one).
// The token travels in the environment as an extraheader, never in argv or a URL, so `ps`
// never shows it (actions/checkout's header, set through GIT_CONFIG_* instead of a file).
export async function checkout({ repository, headSha, baseSha, token, dir, spawn = nodeSpawn, timeoutMs = 120000 }) {
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
  };
  const shas = baseSha && baseSha !== headSha ? [headSha, baseSha] : [headSha];
  await run(spawn, ['init', '-q', dir], { env, timeoutMs });
  await run(spawn, ['config', 'core.symlinks', 'false'], { cwd: dir, env, timeoutMs });
  await run(spawn, ['fetch', '-q', '--depth=1', `https://github.com/${repository}.git`, ...shas], { cwd: dir, env, timeoutMs });
  await run(spawn, ['checkout', '-q', '--detach', headSha], { cwd: dir, env, timeoutMs });
}
