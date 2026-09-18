import type { CapturedRequest } from '../types';
import { filterTrafficByConsumer } from '../../shared/consumerUtils';
import { isInstabilityRecord } from '../../shared/trafficInstability';

export function filterTrafficRequests(
  requests: CapturedRequest[],
  query: string,
  consumerId?: string | null,
): CapturedRequest[] {
  const byConsumer = filterTrafficByConsumer(requests, consumerId ?? null);
  const term = query.trim().toLowerCase();
  if (!term) return byConsumer;

  return byConsumer.filter((req) => {
    const path = req.path.toLowerCase();
    const method = req.method.toLowerCase();
    const status = req.responseStatus != null ? String(req.responseStatus) : '';
    const consumer = (req.consumerLabel || '').toLowerCase();
    const instability = (req.instabilityMessage || req.instabilityKind || '').toLowerCase();

    return path.includes(term)
      || method.includes(term)
      || status.includes(term)
      || consumer.includes(term)
      || instability.includes(term)
      || (isInstabilityRecord(req) && 'instability'.includes(term));
  });
}
