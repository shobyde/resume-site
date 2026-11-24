#!/usr/bin/env node
/**
 * MCP-shaped bridge (rung 17): the same capabilities as JSON-RPC tools, driven
 * by a deterministic planner.
 *
 * Two systems are measured on the same tasks over the same handlers:
 *   naive  — the bridge a host writes in ten minutes: ids become tool names,
 *            `tools/list` returns those names with no schema, `tools/call` runs
 *            whatever arrived, and anything unexpected throws out of the
 *            dispatcher. It is an RPC shim, not a protocol.
 *   bridge  — `createToolServer` + `createToolClient` + `planToolCall`: tools
 *            carry their JSON Schema, arguments are validated on the server's
 *            side of the wire, refusals are results, protocol errors are
 *            JSON-RPC errors, and a sentence becomes a call without a model.
 *
 * The planner tasks use the site's real manifest, so a pass means the tool a
 * caller would have to know by name was found from the words a visitor types.
 *
 * Usage: node bench/no-llm/mcp.mjs [--suite mcp.json] [--before] [--verbose]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createToolClient, createToolServer, planToolCall, toolName } from 'boaz';
import { capabilities, runCapability } from '../agent-setup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argValue = (flag) => {
  const at = process.argv.indexOf(flag);
  return at >= 0 ? process.argv[at + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');
const suite = JSON.parse(await readFile(path.resolve(here, argValue('--suite') ?? 'mcp.json'), 'utf8'));

/* ---------------------------------------------------------------- the bridge */

const runs = { bridge: 0, naive: 0 };

const bridge = createToolServer({
  name: 'shobyde.com',
  version: '0.0.0-bench',
  capabilities,
  run: (id, args) => {
    runs.bridge += 1;
    return runCapability(id, args);
  },
});
const bridgeClient = createToolClient((message) => bridge.handle(message));

/* ------------------------------------------------------------- the baseline */

/**
 * The ten-minute version. It answers `initialize` badly (a version string it
 * made up), lists tool names with no schema, runs a handler with whatever
 * arguments arrived, replies to notifications, and throws on anything it did
 * not expect — which over a real transport takes the channel down with it.
 */
function createNaiveBridge() {
  let calls = 0;
  const handle = async (message) => {
    if (message?.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'demo', version: '0.0.0' }, instructions: undefined },
      };
    }
    if (message?.method === 'tools/list') {
      return { jsonrpc: '2.0', id: message.id ?? null, result: { tools: capabilities.map((c) => ({ name: c.id, description: c.title })) } };
    }
    if (message?.method === 'tools/call') {
      calls += 1;
      runs.naive += 1;
      const result = await runCapability(message.params.name, message.params.arguments ?? {});
      return {
        jsonrpc: '2.0',
        id: null,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      };
    }
    throw new Error(`unhandled method ${message?.method}`);
  };
  return { handle, calls: () => calls };
}

const naive = createNaiveBridge();
const naiveCalls = { value: 0 };
const naiveClient = {
  initialize: async () => (await naive.handle({ jsonrpc: '2.0', id: 1, method: 'initialize' })).result,
  listTools: async () => (await naive.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools,
  callTool: async (name, args = {}) => {
    naiveCalls.value += 1;
    const reply = await naive.handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: args } });
    return reply.result;
  },
};

/* ------------------------------------------------------------------- scoring */

const PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

async function runTask(task, side) {
  const client = side === 'bridge' ? bridgeClient : naiveClient;
  const handle = side === 'bridge' ? bridge.handle : naive.handle;
  // The baseline has no planner at all: its caller must already know the tool
  // name, which is exactly what these tasks measure.
  if (side === 'naive' && task.kind.startsWith('plan')) return false;
  switch (task.kind) {
    case 'init': {
      const info = await client.initialize();
      return Boolean(info?.protocolVersion && info?.serverInfo?.name && info?.capabilities?.tools);
    }
    case 'list': {
      const tools = await client.listTools();
      if (tools.length !== capabilities.length) return false;
      if (task.names) return tools.every((tool) => PATTERN.test(tool.name));
      return true;
    }
    case 'schema': {
      const tools = await client.listTools();
      const target = tools.find((tool) => tool.name === (task.tool ?? ''));
      if (!target) return false;
      const declared = target.inputSchema?.required ?? [];
      return task.required.every((name) => declared.includes(name));
    }
    case 'call': {
      const result = await client.callTool(task.tool, task.args ?? {});
      if (result?.isError) return false;
      if (task.text && !String(result?.content?.[0]?.text ?? '').includes(task.text)) return false;
      if (task.structured) {
        const value = result?.structuredContent;
        return Object.entries(task.structured).every(([key, expected]) =>
          typeof expected === 'number' ? typeof value?.[key] === 'number' : value?.[key] !== undefined,
        );
      }
      return true;
    }
    case 'invalid': {
      const before = runs[side];
      const result = await client.callTool(task.tool, task.args ?? {});
      const ran = runs[side] > before;
      if (!result?.isError) return false;
      if (task.text && !String(result?.content?.[0]?.text ?? '').includes(task.text)) return false;
      // The baseline runs the handler anyway, so "no handler ran" separates
      // validation from a message that only looks like a refusal.
      return task.notRun ? !ran : true;
    }
    case 'unknown-tool': {
      let reply;
      try {
        reply = await handle({ jsonrpc: '2.0', id: 30, method: 'tools/call', params: { name: 'not_a_tool', arguments: {} } });
      } catch {
        return false;
      }
      if (reply?.error?.code !== -32602) return false;
      // A protocol error must not end the conversation.
      if (task.recovers) {
        const after = await handle({ jsonrpc: '2.0', id: 31, method: 'ping' });
        return Boolean(after && !after.error);
      }
      return true;
    }
    case 'unknown-method': {
      try {
        const reply = await handle({ jsonrpc: '2.0', id: 32, method: 'resources/list' });
        return reply?.error?.code === -32601;
      } catch {
        return false;
      }
    }
    case 'invalid-rpc': {
      // A payload the protocol does not allow must come back as an error, on
      // the same channel, with the rest of the conversation intact.
      try {
        const reply = await handle(task.message);
        if (reply?.error?.code !== task.code) return false;
        const after = await handle({ jsonrpc: '2.0', id: 40, method: 'ping' });
        return Boolean(after && !after.error);
      } catch {
        return false;
      }
    }
    case 'plan-route-blocked': {
      const plan = planToolCall(task.q, { capabilities });
      if (plan.calls.length !== task.count) return false;
      return plan.calls[task.index].runnable === false && plan.calls[task.index].reason === 'route';
    }
    case 'notification': {
      try {
        const reply = await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
        return reply === null;
      } catch {
        return false;
      }
    }
    case 'id': {
      const reply = await handle({ jsonrpc: '2.0', id: task.id, method: 'tools/list' });
      return reply?.id === task.id;
    }
    case 'plan': {
      const plan = planToolCall(task.q, { capabilities });
      const got = plan.calls.map((call) => call.name);
      const want = task.expect.map((name) => toolName(name));
      if (got.length !== want.length || !got.every((name, i) => name === want[i])) return false;
      if (task.args) return JSON.stringify(plan.calls[0].args) === JSON.stringify(task.args);
      return true;
    }
    case 'plan-blocked': {
      const plan = planToolCall(task.q, { capabilities });
      return plan.calls.length === 1 && plan.calls[0].runnable === false && plan.calls[0].reason === task.reason;
    }
    case 'plan-declined': {
      const plan = planToolCall(task.q, { capabilities });
      return plan.calls.length === 0 && Boolean(plan.declined);
    }
    default:
      throw new Error(`unknown task kind ${task.kind}`);
  }
}

const sides = process.argv.includes('--before') ? ['naive', 'bridge'] : ['bridge'];
const results = new Map();
for (const side of sides) {
  const rows = [];
  for (const task of suite.tasks) {
    let ok = false;
    let error;
    try {
      ok = await runTask(task, side);
    } catch (thrown) {
      error = thrown instanceof Error ? thrown.message : String(thrown);
    }
    rows.push({ task, ok, error });
    if (verbose) {
      console.log(`${ok ? 'ok  ' : 'MISS'} ${side.padEnd(6)} ${task.kind.padEnd(14)} ${task.id}  ${error ? `(${error})` : ''}`);
    }
  }
  results.set(side, rows);
}

const pct = (rows) => Math.round((rows.filter((row) => row.ok).length / rows.length) * 1000) / 10;
const byKind = (rows) => {
  const kinds = [...new Set(rows.map((row) => row.task.kind))];
  return kinds.map((kind) => {
    const list = rows.filter((row) => row.task.kind === kind);
    return `${kind} ${list.filter((row) => row.ok).length}/${list.length}`;
  });
};

const notes = [];
for (const [side, rows] of results) {
  console.log(`${side.padEnd(6)} ${pct(rows)}%  (${rows.filter((row) => row.ok).length}/${rows.length})  ${byKind(rows).join('  ')}`);
  for (const row of rows.filter((entry) => !entry.ok)) notes.push(`${side}:${row.task.id}`);
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results: Object.fromEntries([...results].map(([side, rows]) => [side, rows.map((row) => ({ id: row.task.id, ok: row.ok }))])) }));
}
if (notes.length) console.log(`misses ${notes.length}: ${notes.join(' ')}`);
