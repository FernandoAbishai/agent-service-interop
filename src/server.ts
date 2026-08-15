import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { FileFsmStore } from './fsm-store.ts';
import { PlumbingAipAdapter, AIP_VERSION } from './aip-adapter.ts';
import { ValidationError } from './validation.ts';

const MAX_BODY_BYTES = 64 * 1024;

function originFor(req: IncomingMessage): string {
  const configured = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  return `http://${req.headers.host ?? '127.0.0.1:3000'}`;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new ValidationError('INVALID_INPUT', 'Request body exceeds 64 KB', 413);
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ValidationError('INVALID_INPUT', 'Request body must be valid JSON');
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

export function createAipServer(adapter: PlumbingAipAdapter) {
  return createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.end();
      return;
    }

    try {
      if (req.method === 'GET' && req.url === '/.well-known/agent-intake.json') {
        json(res, 200, adapter.manifest(originFor(req)));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/aip/residential-plumbing-quote') {
        const body = await readJson(req);
        json(res, 200, adapter.submit(body, originFor(req)));
        return;
      }
      if (req.method === 'POST' && req.url === '/api/aip/bind') {
        const body = await readJson(req);
        json(res, 200, adapter.bind(body));
        return;
      }
      json(res, 404, { error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
    } catch (error) {
      if (error instanceof ValidationError) {
        const body = {
          aip_version: AIP_VERSION,
          status: 'error',
          error: { code: error.code, message: error.message }
        };
        json(res, error.httpStatus, body);
        return;
      }
      json(res, 500, {
        aip_version: AIP_VERSION,
        status: 'error',
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected adapter failure' }
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const statePath = resolve(process.env.FSM_STATE_PATH ?? '.runtime/fsm-state.json');
  const store = new FileFsmStore(statePath);
  const adapter = new PlumbingAipAdapter({ store });
  const server = createAipServer(adapter);
  server.listen(port, '127.0.0.1', () => {
    console.log(`agent-service-interop AIP adapter listening on http://127.0.0.1:${port}`);
    console.log(`file-backed FSM state: ${statePath}`);
  });
}
