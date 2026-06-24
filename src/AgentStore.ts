import * as vscode from 'vscode';
import { AgentState, AgentRole, SwarmConfig, DEFAULT_CONFIG, DEEPSEEK_SECRET_KEY } from './types';

const ROLE_DEFAULTS: Record<AgentRole, { name: string; systemPrompt: string; defaultModel: string }> = {
  planner: {
    name: 'Planner',
    defaultModel: 'gpt-4.1',
    systemPrompt: `You are the Swarm Planner. Break the task into discrete, logical steps. Identify exactly which files are impacted. Output ONLY the technical plan. No conversational filler.`,
  },
  architect: {
    name: 'Architect',
    defaultModel: 'gpt-4.1',
    systemPrompt: `You are the Swarm Architect. Define data structures, API contracts, and logic flow based on the plan. Be precise and technical. No preamble.`,
  },
  coder: {
    name: 'Coder',
    defaultModel: 'gpt-4.1',
    systemPrompt: `You are the Swarm Coder. Implement the architecture now. You HAVE write permission. For every change, use: [WRITE_FILE: path]...[/WRITE_FILE]. Zero talk, 100% code.`,
  },
  arbitrator: {
    name: 'Arbitrator',
    defaultModel: 'claude-sonnet-4.6',
    systemPrompt: `You are the Swarm Arbitrator. Verify the solution against the objective. If any file is buggy or missing, rewrite it immediately with [WRITE_FILE: path]. End with a summary of changes.`,
  },
};

export class AgentStore {
  private _agents: AgentState[] = [];
  private _totalTokens: number = 0;
  private _config: SwarmConfig = { ...DEFAULT_CONFIG };
  private _deepModeCount: number = 0; // Track consecutive deep mode uses
  private _deepseekApiKey: string = '';
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  public readonly onDidChange = this._onDidChange.event;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._loadConfig();
    // Fire-and-forget secret load; callers can await init() if needed
    this._loadSecret();
  }

  // ── Async Initialization (load secret from OS keychain) ──
  public async init(): Promise<void> {
    await this._loadSecret();
  }

  // ── Agent Access ──
  public all(): AgentState[] { return [...this._agents]; }
  public getByRole(role: AgentRole): AgentState | undefined { return this._agents.find(a => a.role === role); }

  // ── Token Tracking ──
  public getTotalTokens(): number { return this._totalTokens; }
  public getTokenLimit(): number { return this._config.tokenBudget; }
  public setTokenLimit(limit: number) { this._config.tokenBudget = limit; this._save(); }
  public incrementTotalTokens(amount: number) { this._totalTokens += amount; this._save(); }

  // ── DeepSeek API Key (stored in SecretStorage / OS keychain) ──
  public getDeepSeekApiKey(): string {
    return this._deepseekApiKey;
  }

  public async setDeepSeekApiKey(key: string): Promise<void> {
    this._deepseekApiKey = key;
    if (key) {
      await this._context.secrets.store(DEEPSEEK_SECRET_KEY, key);
    } else {
      await this._context.secrets.delete(DEEPSEEK_SECRET_KEY);
    }
  }

  public async loadSecretFromStorage(): Promise<void> {
    await this._loadSecret();
  }

  private async _loadSecret(): Promise<void> {
    try {
      this._deepseekApiKey = await this._context.secrets.get(DEEPSEEK_SECRET_KEY) || '';
    } catch {
      this._deepseekApiKey = '';
    }
  }

  // ── Config ──
  public getConfig(): SwarmConfig { return { ...this._config }; }
  public updateConfig(patch: Partial<SwarmConfig>) {
    this._config = { ...this._config, ...patch };
    this._refreshAgents();
    this._save();
  }

  private _refreshAgents() {
    this._agents.forEach(agent => {
      const def = ROLE_DEFAULTS[agent.role];
      if (agent.role === 'planner' || agent.role === 'architect') {
        // plannerModel applies to planner and architect only
        agent.modelId = this._config.plannerModel || (def?.defaultModel ?? 'gpt-4.1');
      } else if (agent.role === 'coder') {
        agent.modelId = this._config.coderModel || (def?.defaultModel ?? 'gpt-4.1');
      } else if (agent.role === 'arbitrator') {
        // Provider-aware default: DeepSeek uses deepseek-v4-pro, Copilot uses claude-sonnet-4.6
        // User can override via arbitratorModel setting
        const deepseekDefault = 'deepseek-v4-pro';
        const copilotDefault = def?.defaultModel ?? 'claude-sonnet-4.6';
        const providerDefault = this._config.provider === 'deepseek' ? deepseekDefault : copilotDefault;
        agent.modelId = this._config.arbitratorModel || providerDefault;
      }
    });
  }

  // ── Deep Mode Counter ──
  public getDeepModeCount(): number { return this._deepModeCount; }
  public incrementDeepMode() { this._deepModeCount++; this._save(); }
  public resetDeepMode() { this._deepModeCount = 0; this._save(); }

  // ── Patch Agent ──
  public patch(id: string, patch: Partial<AgentState>) {
    const idx = this._agents.findIndex(a => a.id === id);
    if (idx !== -1) {
      this._agents[idx] = { ...this._agents[idx], ...patch };
      this._save();
    }
  }

  public patchByRole(role: AgentRole, patch: Partial<AgentState>) {
    const agent = this._agents.find(a => a.role === role);
    if (agent) this.patch(agent.id, patch);
  }

  // ── Reset All Agents ──
  public resetAll() {
    this._agents.forEach(a => {
      a.status = 'idle';
      a.lastResponse = '';
      a.tokensUsed = 0;
    });
    this._save();
  }

  // ── Persistence ──
  private _loadConfig() {
    this._totalTokens = this._context.globalState.get<number>('swarm.totalTokens', 0);
    this._deepModeCount = this._context.globalState.get<number>('swarm.deepModeCount', 0);
    
    const savedConfig = this._context.globalState.get<SwarmConfig>('swarm.config');
    if (savedConfig) this._config = { ...DEFAULT_CONFIG, ...savedConfig };

    // Create the fixed 4-agent setup
    this._agents = (Object.keys(ROLE_DEFAULTS) as AgentRole[]).map(role => {
      const def = ROLE_DEFAULTS[role];
      return {
        id: `agent-${role}`,
        role,
        name: def.name,
        modelId: def.defaultModel,
        systemPrompt: def.systemPrompt,
        objective: '',
        status: 'idle' as const,
      };
    });

    // Apply config to sync models
    this._refreshAgents();
  }

  private _save() {
    this._context.globalState.update('swarm.totalTokens', this._totalTokens);
    this._context.globalState.update('swarm.config', this._config);
    this._context.globalState.update('swarm.deepModeCount', this._deepModeCount);
    this._onDidChange.fire();
  }

  public dispose() {}
}
