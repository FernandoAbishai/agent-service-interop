export type ConsentScope = 'intake' | 'offer' | 'bind' | 'account_creation' | 'payment';

export type AipAgent = {
  id: string;
  platform?: string;
  name?: string;
  consent_scope: ConsentScope[];
};

export type PlumbingIntakeData = {
  postal_code: string;
  service_need: 'leak_diagnosis';
  urgency: 'emergency' | 'within_24h' | 'this_week' | 'flexible';
  availability_window: 'weekday_morning' | 'weekday_afternoon' | 'weekday_after_15_00' | 'weekend' | 'flexible';
};

export type AipIntakeRequest = {
  aip_version: '0.1.0';
  agent: AipAgent;
  intake_data: PlumbingIntakeData;
  session_id: string;
  metadata?: Record<string, unknown>;
};

export type Address = {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

export type AipBindRequest = {
  offer_id: string;
  session_id: string;
  bind_data: {
    full_name: string;
    phone: string;
    address: Address;
    email?: string;
  };
  agent: {
    id: string;
    consent_scope: ConsentScope[];
  };
  metadata?: Record<string, unknown>;
};

export type FsmSession = {
  session_id: string;
  agent_id: string;
  requirement: {
    requirement_id: string;
    postal_code: string;
    service_need: PlumbingIntakeData['service_need'];
    urgency: PlumbingIntakeData['urgency'];
    availability_window: PlumbingIntakeData['availability_window'];
  };
  quote: {
    quote_id: string;
    offer_id: string;
    status: 'offered' | 'accepted';
    currency: 'USD';
    line_items: Array<{ description: string; amount: number }>;
    total: number;
    valid_until: string;
  };
  job: {
    job_id: string;
    status: 'pending' | 'scheduled';
    scheduled_for?: string;
  };
  binding: null | {
    full_name: string;
    phone: string;
    address: Address;
    email?: string;
    bound_at: string;
  };
};

export type FsmState = {
  version: 1;
  sessions: Record<string, FsmSession>;
};
