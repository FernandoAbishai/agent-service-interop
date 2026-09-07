import express, { type Express } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import { agentCardHandler, restHandler, UserBuilder } from '@a2a-js/sdk/server/express';
import { resolve } from 'node:path';
import { FileFsmStore } from './fsm-store.ts';
import { createA2ARequestHandler } from './a2a-agent.ts';
import { FileWorkflowCorrelationStore } from './workflow-correlation.ts';
import { FileFsmWorkflowInspectionSource, projectWorkflowInspection, type WorkflowInspectionSource } from './workflow-inspection.ts';

export function createA2AApp(baseUrl: string, source: WorkflowInspectionSource): Express {
  const requestHandler = createA2ARequestHandler(baseUrl, source);
  const app = express();

  app.get('/api/interop/workflows/:workflowId/inspection', (req, res) => {
    const inspection = projectWorkflowInspection(source, req.params.workflowId);
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
  const correlationPath = resolve(process.env.WORKFLOW_CORRELATION_PATH ?? '.runtime/workflow-correlations.json');
  const store = new FileFsmStore(statePath);
  const correlations = new FileWorkflowCorrelationStore(correlationPath);
  const source = new FileFsmWorkflowInspectionSource(store, correlations);
  const app = createA2AApp(baseUrl, source);

  app.listen(port, host, () => {
    console.log(`agent-service-interop provider surfaces listening on ${baseUrl}`);
    console.log(`agent card: ${baseUrl}/${AGENT_CARD_PATH}`);
    console.log(`A2A HTTP+JSON binding: ${baseUrl}/a2a`);
    console.log(`read-only inspection: ${baseUrl}/api/interop/workflows/{workflow_id}/inspection`);
    console.log(`shared file-backed FSM state: ${statePath}`);
    console.log(`interop correlation state: ${correlationPath}`);
  });
}
