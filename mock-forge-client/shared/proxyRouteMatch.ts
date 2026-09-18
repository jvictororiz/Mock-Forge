import { matchesRoutePath } from './routePathMatch';

export interface InterceptRoute {
  method: string;
  path: string;
}

export function shouldInterceptForMock(
  method: string,
  url: string,
  routes: InterceptRoute[],
): boolean {
  const requestPath = (url || '/').split('?')[0] || '/';
  const normalizedMethod = (method || 'GET').toUpperCase();

  return routes.some((route) => {
    const routeMethod = (route.method || 'GET').toUpperCase();
    if (routeMethod !== normalizedMethod) return false;

    return matchesRoutePath(route.path, requestPath);
  });
}
