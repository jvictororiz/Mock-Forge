import { applyEnvironmentMutation } from '../../shared/environmentMutations';
import {
  bumpEnvironmentRevision,
  describeMutationResult,
  type McpMutation,
  type McpMutationSuccess,
} from '../../shared/mcpBridge';
import type { Environment } from '../../shared/types';
import { tryMutateViaBridge } from './bridgeClient';
import { deleteEnvironment, getDataDir, listEnvironments, saveEnvironment } from './storage';

function finish(
  environment: Environment | null,
  route: McpMutationSuccess['route'],
  openEditor: boolean,
  selectedRouteId: string | null,
  editorTab: McpMutationSuccess['editorTab'],
  appliedLive: boolean,
): McpMutationSuccess {
  const result = {
    ok: true as const,
    appliedLive,
    environment,
    route,
    openEditor,
    selectedRouteId,
    editorTab,
    message: '',
  };
  result.message = describeMutationResult(result, appliedLive);
  return result;
}

export function commitMutationToDisk(mutation: McpMutation): McpMutationSuccess {
  const environments = listEnvironments();
  const outcome = applyEnvironmentMutation(environments, mutation, null);

  for (const id of outcome.deleteIds) deleteEnvironment(id);

  const saved = new Map<string, Environment>();
  for (const id of outcome.saveIds) {
    const environment = outcome.environments.find((item) => item.id === id);
    if (!environment) continue;
    const disk = environments.find((item) => item.id === id);
    saved.set(id, saveEnvironment(bumpEnvironmentRevision(environment, disk?.revision)));
  }

  const touchedId = outcome.saveIds[0] ?? null;
  return finish(
    touchedId ? saved.get(touchedId) ?? null : null,
    outcome.route,
    outcome.openEditor,
    outcome.replaceSelection ? outcome.selectedRouteId : null,
    outcome.editorTab,
    false,
  );
}

export async function commitMutation(mutation: McpMutation): Promise<McpMutationSuccess> {
  const live = await tryMutateViaBridge(getDataDir(), mutation);
  if (live) return live;
  return commitMutationToDisk(mutation);
}
