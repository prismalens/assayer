// A minimal ACP agent for tests. FAKE_AGENT_MODE=slow-tool runs one tool call that stays open
// for FAKE_AGENT_WAIT ms with no updates; capacity fails the prompt as a busy provider does;
// echo takes any mode and writes what it was started with to FAKE_AGENT_REPORT; otherwise it
// refuses session/set_mode. A prompt that arrives is recorded in FAKE_AGENT_LOG.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

const log = process.env.FAKE_AGENT_LOG;
const mode = process.env.FAKE_AGENT_MODE;
const slow = mode === 'slow-tool';
const update = (ctx, update) => ctx.client.notify(acp.methods.client.session.update, { sessionId: 'fake-1', update });
// What the engine would load: its user-level MCP servers from $HOME, and the checkout's agent config.
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const CONFIG = ['.opencode/plugin/x.js', '.claude/settings.json', '.codex/config.toml', '.agents/skills/x/SKILL.md', '.mcp.json'];
acp.agent({ name: 'fake' })
  .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {} }))
  .onRequest(acp.methods.agent.session.new, (ctx) => {
    if (mode === 'echo') {
      const user = JSON.parse(read(path.join(process.env.HOME ?? '', '.fake-agent', 'mcp.json')) ?? '{"mcpServers":{}}');
      writeFileSync(process.env.FAKE_AGENT_REPORT, JSON.stringify({
        env: process.env, meta: ctx.params._meta ?? null, userMcpServers: Object.keys(user.mcpServers),
        files: Object.fromEntries(CONFIG.map((f) => [f, read(path.join(ctx.params.cwd, f))])),
      }));
    }
    return { sessionId: 'fake-1' };
  })
  .onRequest(acp.methods.agent.session.setMode, () => {
    if (mode === 'echo') return {};
    throw new acp.RequestError(-32000, 'mode refused by the fake agent');
  })
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    appendFileSync(log, 'prompted\n');
    if (mode === 'capacity') throw new acp.RequestError(-32603, 'Selected model is at capacity. Please try a different model.');
    if (slow) {
      await update(ctx, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'task', kind: 'think', status: 'in_progress' });
      await new Promise((r) => setTimeout(r, Number(process.env.FAKE_AGENT_WAIT)));
      await update(ctx, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    }
    return { stopReason: 'end_turn' };
  })
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
