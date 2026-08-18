import express, { type Express, type RequestHandler } from 'express';
import { resolve } from 'node:path';
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server';
import { FileFsmStore } from './fsm-store.ts';
import { projectWorkflowInspection } from './workflow-inspection.ts';

export const CIRCLE_GATEWAY_TESTNET_URL = 'https://gateway-api-testnet.circle.com';
export const DEFAULT_X402_INSPECTION_PRICE = '$0.001';

export type PaidInspectionOptions = {
  publicWorkflowId: string;
  paymentGate: RequestHandler;
};

export type CircleGatewayPaymentConfig = {
  sellerAddress: string;
  price?: string;
  facilitatorUrl?: string;
};

function resourceNotAvailable(res: Parameters<RequestHandler>[1]): void {
  res.status(404).json({
    error: {
      code: 'RESOURCE_NOT_AVAILABLE',
      message: 'Resource not available on this public inspection surface'
    }
  });
}

function assertPublicWorkflowId(workflowId: string): void {
  if (!workflowId.startsWith('wf-') || workflowId.length <= 3) {
    throw new Error('publicWorkflowId must be an explicit canonical workflow ID beginning with wf-');
  }
}

function assertSellerAddress(address: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('X402 seller address must be a 20-byte EVM address');
  }
}

function assertPrice(price: string): void {
  if (!/^\$\d+(?:\.\d+)?$/.test(price)) {
    throw new Error('X402 inspection price must use a dollar string such as $0.001');
  }
}

/**
 * Circle Gateway is an external payment/access rail for this resource. The
 * returned middleware must never be treated as workflow authorization.
 */
export function createCircleGatewayPaymentGate(config: CircleGatewayPaymentConfig): RequestHandler {
  const price = config.price ?? DEFAULT_X402_INSPECTION_PRICE;
  assertSellerAddress(config.sellerAddress);
  assertPrice(price);

  const gateway = createGatewayMiddleware({
    sellerAddress: config.sellerAddress as `0x${string}`,
    facilitatorUrl: config.facilitatorUrl ?? CIRCLE_GATEWAY_TESTNET_URL
  });

  return gateway.require(price) as RequestHandler;
}

/**
 * Public x402 surface used by TH-INTEROP-19.
 *
 * The public-resource policy executes before payment middleware. Therefore a
 * payment attempt can never turn an arbitrary/private workflow ID into an
 * authorized resource. Non-public and nonexistent IDs intentionally share the
 * same 404 response to avoid exposing whether a workflow exists.
 */
export function createPaidInspectionApp(store: FileFsmStore, options: PaidInspectionOptions): Express {
  assertPublicWorkflowId(options.publicWorkflowId);

  const app = express();

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok', surface: 'x402-public-inspection' });
  });

  app.get(
    '/api/x402/workflows/:workflowId/inspection',
    (req, res, next) => {
      if (req.params.workflowId !== options.publicWorkflowId) {
        resourceNotAvailable(res);
        return;
      }
      next();
    },
    options.paymentGate,
    (req, res) => {
      const inspection = projectWorkflowInspection(store, req.params.workflowId);
      if (!inspection) {
        resourceNotAvailable(res);
        return;
      }

      // Deliberately return only the shared workflow-inspection projection.
      // Payment-layer payer/transaction metadata is not promoted into business
      // identity, customer identity, workflow state, or canonical references.
      res.status(200).json(inspection);
    }
  );

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const publicWorkflowId = process.env.X402_PUBLIC_WORKFLOW_ID;
  const sellerAddress = process.env.X402_SELLER_ADDRESS;

  if (!publicWorkflowId) throw new Error('X402_PUBLIC_WORKFLOW_ID is required');
  if (!sellerAddress) throw new Error('X402_SELLER_ADDRESS is required');

  const port = Number(process.env.X402_PORT ?? 3002);
  const host = process.env.X402_HOST ?? '127.0.0.1';
  const statePath = resolve(process.env.FSM_STATE_PATH ?? '.runtime/fsm-state.json');
  const store = new FileFsmStore(statePath);

  if (!projectWorkflowInspection(store, publicWorkflowId)) {
    throw new Error(`Configured public workflow ${publicWorkflowId} does not exist in the current FSM state`);
  }

  const paymentGate = createCircleGatewayPaymentGate({
    sellerAddress,
    price: process.env.X402_INSPECTION_PRICE ?? DEFAULT_X402_INSPECTION_PRICE,
    facilitatorUrl: process.env.X402_FACILITATOR_URL ?? CIRCLE_GATEWAY_TESTNET_URL
  });
  const app = createPaidInspectionApp(store, { publicWorkflowId, paymentGate });

  app.listen(port, host, () => {
    console.log(`agent-service-interop x402 public inspection listening on http://${host}:${port}`);
    console.log(`public synthetic workflow: ${publicWorkflowId}`);
    console.log(`price per inspection: ${process.env.X402_INSPECTION_PRICE ?? DEFAULT_X402_INSPECTION_PRICE}`);
    console.log(`Circle Gateway facilitator: ${process.env.X402_FACILITATOR_URL ?? CIRCLE_GATEWAY_TESTNET_URL}`);
    console.log(`shared file-backed FSM state: ${statePath}`);
  });
}
