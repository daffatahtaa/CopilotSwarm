import * as vscode from 'vscode';

// ── Agent Roles (fixed 4-agent system) ──
export type AgentRole = 'planner' | 'architect' | 'coder' | 'arbitrator';

export type AgentStatus = 'idle' | 'running' | 'success' | 'error' | 'stopped' | 'skipped';

export interface AgentState {
  id: string;
  role: AgentRole;
  name: string;
  modelId: string;
  systemPrompt: string;
  objective: string;
  status: AgentStatus;
  lastResponse?: string;
  tokensUsed?: number;
}

// ── Task Types (4 action buttons) ──
export type TaskType = 'feature' | 'refactor' | 'tests' | 'debug';

export const TASK_TYPE_META: Record<TaskType, { label: string; icon: string; description: string; color: string }> = {
  feature:  { label: 'New Feature',        icon: '✦', description: 'Build something new from scratch',        color: '#7c3aed' },
  refactor: { label: 'Refactor Code',      icon: '⟲', description: 'Clean, modernize, or optimize code',      color: '#0ea5e9' },
  tests:    { label: 'Tests & Docs',       icon: '✓', description: 'Generate tests and documentation',        color: '#10b981' },
  debug:    { label: 'Debug & Fix',        icon: '⚡', description: 'Find root cause and solve bugs',          color: '#f59e0b' },
};

// ── Provider Type (GitHub Copilot or DeepSeek) ──
export type ProviderType = 'github-copilot' | 'deepseek';

// ── Swarm Modes ──
export type SwarmMode = 'quick' | 'deep' | 'auto';

// ── Pipeline State ──
export type PipelinePhase = 'idle' | 'planning' | 'architecting' | 'coding' | 'arbitrating' | 'done' | 'error';

export interface PipelineState {
  phase: PipelinePhase;
  mode: SwarmMode;       // Resolved mode (never 'auto' at runtime)
  taskType: TaskType;
  activeAgents: AgentRole[];
  completedAgents: AgentRole[];
  summary?: string;
}

// ── Secret Storage key for DeepSeek API key ──
export const DEEPSEEK_SECRET_KEY = 'copilotswarm.deepseekApiKey';

// ── User Config (Advanced Settings) ──
export interface SwarmConfig {
  defaultMode: SwarmMode;
  plannerModel: string;   // Model for Planner + Architect
  coderModel: string;     // Model for Coder
  arbitratorModel: string; // Model for Arbitrator
  tokenBudget: number;    // Max tokens per task (0 = unlimited)
  provider: ProviderType; // 'github-copilot' | 'deepseek'
}

export const DEFAULT_CONFIG: SwarmConfig = {
  defaultMode: 'auto',
  plannerModel: '',       // Empty = use whatever Copilot provides
  coderModel: '',
  arbitratorModel: '',
  tokenBudget: 0,
  provider: 'github-copilot',
};

// ── Swarm State (sent to webview) ──
export interface SwarmState {
  agents: AgentState[];
  pipeline: PipelineState;
  config: SwarmConfig;
  quota?: {
    user: string;
    used: number;
    limit: number;
    unit: string;
  } | null;
  deepseekApiKey?: string;
}

// ── Legacy compat ──
export interface AgentConfig {
  name: string;
  modelId: string;
  systemPrompt: string;
}
