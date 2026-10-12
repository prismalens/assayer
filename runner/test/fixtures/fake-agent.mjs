// A minimal ACP agent for tests. FAKE_AGENT_MODE=slow-tool runs one tool call that stays open
// for FAKE_AGENT_WAIT ms with no updates; otherwise it refuses session/set_mode. A prompt that
// arrives is recorded in FAKE_AGENT_LOG.
import { appendFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

const log = process.env.FAKE_AGENT_LOG;
const slow = process.env.FAKE_AGENT_MODE === 'slow-tool';
const update = (ctx, update) => ctx.client.notify(acp.methods.client.session.update, { sessionId: 'fake-1', update });
acp.agent({ name: 'fake' })
  .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {} }))
  .onRequest(acp.methods.agent.session.new, () => ({ sessionId: 'fake-1' }))
  .onRequest(acp.methods.agent.session.setMode, () => { throw new acp.RequestError(-32000, 'mode refused by the fake agent'); })
  .onRequest(acp.methods.agent.session.prompt, async (ctx) => {
    appendFileSync(log, 'prompted\n');
    if (slow) {
      await update(ctx, { sessionUpdate: 'tool_call', toolCallId: 't1', title: 'task', kind: 'think', status: 'in_progress' });
      await new Promise((r) => setTimeout(r, Number(process.env.FAKE_AGENT_WAIT)));
      await update(ctx, { sessionUpdate: 'tool_call_update', toolCallId: 't1', status: 'completed' });
    }
    return { stopReason: 'end_turn' };
  })
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
