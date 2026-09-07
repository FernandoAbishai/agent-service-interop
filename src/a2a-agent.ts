import { randomUUID } from 'node:crypto';
import type { AgentCard, Artifact, Message, Task } from '@a2a-js/sdk';
import { A2A_PROTOCOL_VERSION, Role, TaskState } from '@a2a-js/sdk';
import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from '@a2a-js/sdk/server';
import { projectWorkflowInspection, type WorkflowInspectionSource } from './workflow-inspection.ts';

export const A2A_AGENT_VERSION = '1.0.0';

export function createPlumbingAgentCard(baseUrl: string): AgentCard {
  return {
    name: 'Demo Plumbing Provider Agent',
    description: 'Read-only A2A surface over correlated service-workflow state without taking operational authority.',
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
        description: 'Inspect an existing service workflow by protocol-neutral workflow ID without mutating operational state.',
        tags: ['plumbing', 'workflow', 'status', 'read-only'],
        examples: ['{"workflow_id":"wf-correlation-001"}'],
        inputModes: ['application/json', 'text/plain'],
        outputModes: ['application/json'],
        securityRequirements: []
      }
    ],
    documentationUrl: '',
    signatures: []
  };
}

function inputWorkflowId(message: Message): string | undefined {
  for (const part of message.parts) {
    const content = part.content;
    if (!content || content.$case !== 'text') continue;
    const text = content.value.trim();
    if (text.startsWith('wf-')) return text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.workflow_id === 'string') return parsed.workflow_id;
    } catch {
      // fall through to the next part
    }
  }
  return undefined;
}

export class PlumbingWorkflowAgentExecutor implements AgentExecutor {
  private readonly source: WorkflowInspectionSource;

  constructor(source: WorkflowInspectionSource) {
    this.source = source;
  }

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const taskId = context.taskId;
    const contextId = context.contextId;
    const workflowId = inputWorkflowId(context.userMessage);
    const payload = workflowId ? projectWorkflowInspection(this.source, workflowId) : undefined;

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

    if (!payload) {
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
              content: { $case: 'text', value: 'Workflow not found. Provide workflow_id for an existing correlated workflow.' },
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

    const operationalJobRef = payload.references.operational_refs.find((ref) => ref.object_type === 'job');
    const artifact: Artifact = {
      artifactId: randomUUID(),
      name: 'service-workflow-observation',
      description: 'Read-only observation of the authoritative plumbing workflow, projected through the shared interoperability inspection view.',
      parts: [{
        content: { $case: 'text', value: JSON.stringify(payload) },
        metadata: undefined,
        filename: 'service-workflow-observation.json',
        mediaType: 'application/json'
      }],
      metadata: {
        workflow_id: payload.references.workflow_id,
        ...(operationalJobRef ? { operational_job_id: operationalJobRef.id } : {})
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

export function createA2ARequestHandler(baseUrl: string, source: WorkflowInspectionSource) {
  return new DefaultRequestHandler(
    createPlumbingAgentCard(baseUrl),
    new InMemoryTaskStore(),
    new PlumbingWorkflowAgentExecutor(source)
  );
}
