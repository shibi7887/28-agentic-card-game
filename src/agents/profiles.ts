// Agent profiles — each AI player has a persona and model configuration

export interface AgentProfile {
  id: string;
  name: string;
  persona: string;
  strategyStyle: string;
  provider: string;       // 'openai' | 'anthropic' | 'deepseek' | 'openrouter'
  model: string;           // model ID for the provider
  temperature: number;
}

// Default profiles — can be overridden via env vars or settings
export const DEFAULT_AGENT_PROFILES: Record<string, AgentProfile> = {
  partner: {
    id: 'partner',
    name: 'Raman',
    persona: 'loyal_partner',
    strategyStyle: 'Supportive — plays to help partner win tricks. Conservative bidding, cooperative play.',
    provider: process.env.AGENT_PARTNER_PROVIDER || 'deepseek',
    model: process.env.AGENT_PARTNER_MODEL || 'deepseek-chat',
    temperature: 0.3,
  },
  opponent1: {
    id: 'opponent1',
    name: 'Krishnan',
    persona: 'aggressive_opponent',
    strategyStyle: 'Aggressive — bids high, plays trump aggressively, takes risks to defeat the bidder.',
    provider: process.env.AGENT_OPPONENT1_PROVIDER || 'deepseek',
    model: process.env.AGENT_OPPONENT1_MODEL || 'deepseek-chat',
    temperature: 0.5,
  },
  opponent2: {
    id: 'opponent2',
    name: 'Kunjappu',
    persona: 'unpredictable_opponent',
    strategyStyle: 'Unpredictable — mixes conservative and aggressive play. Hard to read, sometimes bluffs.',
    provider: process.env.AGENT_OPPONENT2_PROVIDER || 'deepseek',
    model: process.env.AGENT_OPPONENT2_MODEL || 'deepseek-chat',
    temperature: 0.7,
  },
};

export function getAgentProfile(agentId: string): AgentProfile {
  return DEFAULT_AGENT_PROFILES[agentId] || DEFAULT_AGENT_PROFILES.partner;
}
