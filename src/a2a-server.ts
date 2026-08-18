import express, { type Express } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { agentCardHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { resolve } from 'node:path';
import { FileFsmStore } from './fsm-store.ts';
import { createA2ARequestHandler } from './a2a-agent.ts';
import { projectWorkflowInspection } from './workflow-inspection.ts';

export function createA2AApp(baseUrl: string, store: FileFsmStore): Express {
  const requestHandler = createA2ARequestHandler(baseUrl, store);
  const app = express();

  app.get('/api/interop/workflows/:workflowId/inspection', (req, res) => {
    const inspection = projectWorkflowInspection(store, req.params.workflowId);
    if (!inspection) {
      res.status(404).json({
        error: {
          code: 'WORKFLOW_NOT_FOUND',
          message: 'Workflow not found'
        }
      });
      return;
    }
    res.status(200).json(inspection);
  });

  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: requestHandler }));
  app.use('/a2a', restHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.A2A_PORT ?? 3001);
  const host = process.env.A2A_HOST ?? '127.0.0.1';
  const configuredBaseUrl = process.env.A2A_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const baseUrl = configuredBaseUrl ?? `http://${host}:${port}`;
  const statePath = resolve(process.env.FSM_STATE_PATH ?? '.runtime/fsm-state.json');
  const store = new FileFsmStore(statePath);
  const app = createA2AApp(baseUrl, store);

  app.listen(port, host, () => {
    console.log(`agent-service-interop provider surfaces listening on ${baseUrl}`);
    console.log(`agent card: ${baseUrl}/${AGENT_CARD_PATH}`);
    console.log(`A2A HTTP+JSON binding: ${baseUrl}/a2a`);
    console.log(`read-only inspection: ${baseUrl}/api/interop/workflows/{workflow_id}/inspection`);
    console.log(`shared file-backed FSM state: ${statePath}`);
  });
}
