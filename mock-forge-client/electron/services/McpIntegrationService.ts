import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import type {
  McpClientId,
  McpClientInfo,
  McpIntegrationResult,
  McpManualConfig,
} from '../../shared/mcpTypes';

const MCP_SERVER_KEY = 'mockforge';

interface McpClientDefinition {
  id: McpClientId;
  name: string;
  detectPaths: string[];
  configPath: string;
  serversKey: 'mcpServers';
}

interface McpConfigFile {
  mcpServers?: Record<string, unknown>;
}

function getHome(): string {
  return homedir();
}

function getAppData(): string {
  return process.env.APPDATA || join(getHome(), 'AppData', 'Roaming');
}

function getCursorConfigPath(): string {
  if (process.platform === 'win32') {
    return join(getAppData(), 'Cursor', 'mcp.json');
  }
  return join(getHome(), '.cursor', 'mcp.json');
}

function getClaudeConfigPath(): string {
  if (process.platform === 'win32') {
    return join(getAppData(), 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'darwin') {
    return join(getHome(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  return join(getHome(), '.config', 'Claude', 'claude_desktop_config.json');
}

function getWindsurfConfigPath(): string {
  return join(getHome(), '.codeium', 'windsurf', 'mcp_config.json');
}

function getVscodeConfigPath(): string {
  return join(getHome(), '.vscode', 'mcp.json');
}

function getCodexConfigPath(): string {
  if (process.platform === 'win32') {
    return join(getAppData(), 'Codex', 'mcp.json');
  }
  return join(getHome(), '.codex', 'mcp.json');
}

function getClientDefinitions(): McpClientDefinition[] {
  const home = getHome();
  const appData = getAppData();

  return [
    {
      id: 'cursor',
      name: 'Cursor',
      detectPaths: [
        join(home, '.cursor'),
        process.platform === 'darwin' ? '/Applications/Cursor.app' : '',
        process.platform === 'win32' ? join(appData, 'Cursor') : '',
      ].filter(Boolean),
      configPath: getCursorConfigPath(),
      serversKey: 'mcpServers',
    },
    {
      id: 'claude',
      name: 'Claude Desktop',
      detectPaths: [
        process.platform === 'darwin'
          ? join(home, 'Library', 'Application Support', 'Claude')
          : join(appData, 'Claude'),
        process.platform === 'linux' ? join(home, '.config', 'Claude') : '',
      ].filter(Boolean),
      configPath: getClaudeConfigPath(),
      serversKey: 'mcpServers',
    },
    {
      id: 'windsurf',
      name: 'Windsurf',
      detectPaths: [join(home, '.codeium', 'windsurf')],
      configPath: getWindsurfConfigPath(),
      serversKey: 'mcpServers',
    },
    {
      id: 'vscode',
      name: 'VS Code',
      detectPaths: [
        join(home, '.vscode'),
        process.platform === 'darwin' ? '/Applications/Visual Studio Code.app' : '',
        process.platform === 'win32'
          ? join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code')
          : '',
      ].filter(Boolean),
      configPath: getVscodeConfigPath(),
      serversKey: 'mcpServers',
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      detectPaths: [
        join(home, '.codex'),
        process.platform === 'win32' ? join(appData, 'Codex') : '',
      ].filter(Boolean),
      configPath: getCodexConfigPath(),
      serversKey: 'mcpServers',
    },
  ];
}

function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function isDetected(definition: McpClientDefinition): boolean {
  return definition.detectPaths.some((detectPath) => pathExists(detectPath));
}

function readConfigFile(configPath: string): McpConfigFile {
  if (!pathExists(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as McpConfigFile;
  } catch {
    return {};
  }
}

function isConfigured(configPath: string): boolean {
  const config = readConfigFile(configPath);
  return Boolean(config.mcpServers?.[MCP_SERVER_KEY]);
}

export function getMockForgeDataDir(): string {
  return join(homedir(), '.mockforge');
}

export function getMcpServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'mockforge-mcp', 'index.js');
  }
  return join(app.getAppPath(), 'mcp', 'dist', 'index.js');
}

export function buildMcpServerEntry(): Record<string, unknown> {
  const nodePath = process.execPath;
  const mcpServerPath = getMcpServerPath();

  if (app.isPackaged) {
    return {
      command: nodePath,
      args: [mcpServerPath],
      env: {
        MOCKFORGE_DATA_DIR: getMockForgeDataDir(),
        ELECTRON_RUN_AS_NODE: '1',
      },
    };
  }

  return {
    command: 'node',
    args: [mcpServerPath],
    env: {
      MOCKFORGE_DATA_DIR: getMockForgeDataDir(),
    },
  };
}

function ensureConfigDir(configPath: string): void {
  const dir = join(configPath, '..');
  if (!pathExists(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function writeConfigFile(configPath: string, config: McpConfigFile): void {
  ensureConfigDir(configPath);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
}

export function listDetectedClients(): McpClientInfo[] {
  return getClientDefinitions()
    .filter((definition) => isDetected(definition))
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      detected: true,
      configured: isConfigured(definition.configPath),
      configPath: definition.configPath,
    }));
}

export function getManualConfig(): McpManualConfig {
  const entry = buildMcpServerEntry();
  const json = JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: entry } }, null, 2);

  return {
    json,
    mcpServerPath: getMcpServerPath(),
    dataDir: getMockForgeDataDir(),
  };
}

export function setupClient(clientId: McpClientId): McpIntegrationResult {
  const definition = getClientDefinitions().find((client) => client.id === clientId);
  if (!definition) {
    return { success: false, error: 'Unknown client' };
  }

  if (!isDetected(definition)) {
    return { success: false, error: `${definition.name} was not detected on this machine` };
  }

  const mcpServerPath = getMcpServerPath();
  if (!pathExists(mcpServerPath)) {
    return {
      success: false,
      error: 'MCP server binary not found. Rebuild MockForge before integrating.',
    };
  }

  try {
    const current = readConfigFile(definition.configPath);
    const next: McpConfigFile = {
      ...current,
      mcpServers: {
        ...current.mcpServers,
        [MCP_SERVER_KEY]: buildMcpServerEntry(),
      },
    };

    writeConfigFile(definition.configPath, next);
    return { success: true, configPath: definition.configPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function removeClient(clientId: McpClientId): McpIntegrationResult {
  const definition = getClientDefinitions().find((client) => client.id === clientId);
  if (!definition) {
    return { success: false, error: 'Unknown client' };
  }

  if (!pathExists(definition.configPath)) {
    return { success: true, configPath: definition.configPath };
  }

  try {
    const current = readConfigFile(definition.configPath);
    if (!current.mcpServers?.[MCP_SERVER_KEY]) {
      return { success: true, configPath: definition.configPath };
    }

    const { [MCP_SERVER_KEY]: _removed, ...remainingServers } = current.mcpServers;
    const next: McpConfigFile = {
      ...current,
      mcpServers: remainingServers,
    };

    writeFileSync(definition.configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
    return { success: true, configPath: definition.configPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function canExecuteMcpServer(): boolean {
  const mcpServerPath = getMcpServerPath();
  if (!pathExists(mcpServerPath)) return false;

  try {
    accessSync(mcpServerPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
