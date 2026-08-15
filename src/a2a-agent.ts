import { randomUUID } from 'node:crypto';
import type { AgentCard, Artifact, Message, Task } from '@a2a-js/sdk';
import { A2A_PROTOCOL_VERSION, Role, TaskState } from '@a2a-js/sdk';
import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { FileFsmStore } from './fsm-store.ts';
import { toCanonicalWorkflow } from './canonical.ts';

export const A2A_AGENT_VERSION = '1.0.0';

export function createPlumbingAgentCard(baseUrl: string): AgentCard {
  return {
    name: 'Demo Plumbing Provider Agent',
    description: 'Read-only A2A surface over the same synthetic plumbing workflow exposed through AIP.',
    supportedInterfaces: [
      {
        url: `${baseUrl}/a2a`,
        protocolBinding: 'HTTP+JSON',
        tenant: '',
        protocolVersion: A2A_PROTOCOL_VERSION
      }
    ],
    provider: {
      organization: 'Demo Plumbing Co.',
      url: 'https://demo-plumbing.example'
    },
    version: A2A_AGENT_VERSION,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [],
      extendedAgentCard: false
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [
      {
        id: 'inspect_service_workflow',
        name: 'Inspect Service Workflow',
        description: 'Inspect an existing plumbing workflow by canonical workflow ID or AIP session ID without mutating operational state.',
        tags: ['plumbing', 'workflow', 'status', 'read-only'],
        examples: ['{"workflow_id":"wf-37a606b6-86f3-4b6c-8e12-a4db917802ba"}'],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json'],
        securityRequirements: []
      }
    ],
    documentationUrl: '',
    signatures: []
  };
}

function inputReference(message: Message): { workflowId?: string; sessionId?: string } {
  for (const part of message.parts) {
    const content = part.content;
    if (!content) continue;
    if (content.$case === 'text') {
      const text = content.value.trim();
      if (text.startsWith('wf-')) return { workflowId: text };
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
        return { sessionId: text };
      }
      try {
        const parsed = JSON.parse(text) as Record<string, unknown>;
        return {
          workflowId: typeof parsed.workflow_id === 'string' ? parsed.workflow_id : undefined,
          sessionId: typeof parsed.session_id === 'string' ? parsed.session_id : undefined
        };
      } catch {
        // fall through to an empty reference
      }
    }
  }
  return {};
}

function sessionIdFromReference(reference: { workflowId?: string; sessionId?: string }): string | undefined {
  if (reference.sessionId) return reference.sessionId;
  if (reference.workflowId?.startsWith('wf-')) return reference.workflowId.slice(3);
  return undefined;
}

export class PlumbingWorkflowAgentExecutor implements AgentExecutor {
  private readonly store: FileFsmStore;

  constructor(store: FileFsmStore) {
    this.store = store;
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const taskId = context.taskId;
    const contextId = context.contextId;
    const reference = inputReference(context.userMessage);
    const sessionId = sessionIdFromReference(reference);
    const session = sessionId ? this.store.getBySession(sessionId) : undefined;

    const initialTask: Task = context.task ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      artifacts: [],
      history: [context.userMessage],
      metadata: {}
    };
    eventBus.publish(AgentEvent.task(initialTask));

    if (!session) {
      eventBus.publish(AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_FAILED,
          timestamp: new Date().toISOString(),
          message: {
            role: Role.ROLE_AGENT,
            messageId: randomUUID(),
            parts: [{
              content: { $case: 'text', value: 'Workflow not found. Provide workflow_id or session_id for an existing AIP-created workflow.' },
              metadata: undefined,
              filename: '',
              mediaType: 'text/plain'
            }],
            taskId,
            contextId,
            extensions: [],
            metadata: {},
            referenceTaskIds: []
          }
        },
        metadata: {}
      }));
      return;
    }

    const canonical = toCanonicalWorkflow(session);
    const payload = {
      semantics: {
        a2a_task_state_meaning: 'provider-agent interaction state, not physical service execution state',
        operational_authority: canonical.provider.operational_system
      },
      references: {
        canonical_workflow_id: canonical.workflow_id,
        requirement_id: canonical.requirement.requirement_id,
        quote_id: canonical.quote.quote_id,
        aip_offer_id: canonical.quote.representation_refs.aip_offer,
        operational_job_id: canonical.job.job_id
      },
      observed_state: {
        quote_status: canonical.quote.status,
        job_status: canonical.job.status,
        scheduled_for: 'scheduled_for' in canonical.job ? canonical.job.scheduled_for : null,
        completion_status: canonical.completion.provider_claim.status,
        customer_decision_status: canonical.customer_decision.status
      }
    };

    const artifact: Artifact = {
      artifactId: randomUUID(),
      name: 'service-workflow-observation',
      description: 'Read-only observation of the authoritative plumbing workflow, projected through the canonical interoperability model.',
      parts: [{
        content: { $case: 'text', value: JSON.stringify(payload) },
        metadata: undefined,
        filename: 'service-workflow-observation.json',
        mediaType: 'application/json'
      }],
      metadata: {
        canonical_workflow_id: canonical.workflow_id,
        operational_job_id: canonical.job.job_id
      },
      extensions: []
    };

    eventBus.publish(AgentEvent.artifactUpdate({
      taskId,
      contextId,
      artifact,
      lastChunk: true,
      append: false,
      metadata: {}
    }));

    // A completed A2A Task means this inspection interaction completed. It does
    // not mean the underlying physical job completed or was accepted.
    eventBus.publish(AgentEvent.statusUpdate({
      taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_COMPLETED,
        timestamp: new Date().toISOString(),
        message: undefined
      },
      metadata: {}
    }));
  }

  async cancelTask(): Promise<void> {
    // The current skill is synchronous/read-only and has no operational work to cancel.
  }
}

export function createA2ARequestHandler(baseUrl: string, store: FileFsmStore) {
  return new DefaultRequestHandler(
    createPlumbingAgentCard(baseUrl),
    new InMemoryTaskStore(),
    new PlumbingWorkflowAgentExecutor(store)
  );
}
