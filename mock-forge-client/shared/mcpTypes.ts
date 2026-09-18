export type McpClientId = 'cursor' | 'claude' | 'windsurf' | 'vscode' | 'codex';

export type McpClientStatus = 'not_detected' | 'detected' | 'configured';

export interface McpClientInfo {
  id: McpClientId;
  name: string;
  detected: boolean;
  configured: boolean;
  configPath: string | null;
}

export interface McpIntegrationResult {
  success: boolean;
  error?: string;
  configPath?: string;
}

export interface McpManualConfig {
  json: string;
  mcpServerPath: string;
  dataDir: string;
}
