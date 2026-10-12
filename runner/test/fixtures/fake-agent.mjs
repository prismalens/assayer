// A minimal ACP agent for tests: refuses session/set_mode, and records it if a prompt ever arrives.
import { appendFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';

const log = process.env.FAKE_AGENT_LOG;
acp.agent({ name: 'fake' })
  .onRequest(acp.methods.agent.initialize, () => ({ protocolVersion: acp.PROTOCOL_VERSION, agentCapabilities: {} }))
  .onRequest(acp.methods.agent.session.new, () => ({ sessionId: 'fake-1' }))
  .onRequest(acp.methods.agent.session.setMode, () => { throw new acp.RequestError(-32000, 'mode refused by the fake agent'); })
  .onRequest(acp.methods.agent.session.prompt, () => { appendFileSync(log, 'prompted\n'); return { stopReason: 'end_turn' }; })
  .connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
