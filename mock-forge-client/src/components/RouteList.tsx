import React, { useMemo, useState, useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useAppStore } from '../stores/appStore';
import { MethodBadge } from './MethodBadge';
import {
  downloadRouteJson,
  executeRouteFromMenu,
  findDuplicateEnabledRouteIds,
  importRouteFromFile,
  isRouteApplied,
} from '../utils/routeActions';
import { copyRouteCurl } from '../utils/curlActions';
import type { Route } from '../types';
import { showToast } from '../utils/notify';
import { useI18n } from '../hooks/useI18n';
import { useFloatingMenu } from '../hooks/useFloatingMenu';
import { RouteListMenu } from './RouteListMenu';
import { TabLoadingFallback } from './TabLoadingFallback';
import { ensureCurrentEnvironment } from '../utils/ensureEnvironment';

export function RouteList() {
  const { t } = useI18n();
  const {
    currentEnvironment,
    selectedRouteId,
    setSelectedRouteId,
    deleteRoute,
    duplicateRoute,
    setRouteMockEnabled,
    addRoute,
  } = useAppStore(
    (state) => ({
      currentEnvironment: state.currentEnvironment,
      selectedRouteId: state.selectedRouteId,
      setSelectedRouteId: state.setSelectedRouteId,
      deleteRoute: state.deleteRoute,
      duplicateRoute: state.duplicateRoute,
      setRouteMockEnabled: state.setRouteMockEnabled,
      addRoute: state.addRoute,
    }),
    shallow,
  );
  const [executingRouteId, setExecutingRouteId] = useState<string | null>(null);
  const [environmentReady, setEnvironmentReady] = useState(!!currentEnvironment);
  const {
    menu,
    menuRef,
    closeMenu,
    openFromButton,
    openFromContextMenu,
  } = useFloatingMenu<string>();

  useEffect(() => {
    if (currentEnvironment) {
      setEnvironmentReady(true);
      return;
    }

    let cancelled = false;
    void ensureCurrentEnvironment().finally(() => {
      if (!cancelled) setEnvironmentReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [currentEnvironment]);

  const duplicateRouteIds = useMemo(
    () => (currentEnvironment ? findDuplicateEnabledRouteIds(currentEnvironment.routes) : new Set<string>()),
    [currentEnvironment?.routes],
  );

  if (!environmentReady) {
    return <TabLoadingFallback />;
  }

  if (!currentEnvironment) {
    return <div style={styles.empty}>{t.environments.empty}</div>;
  }

  const handleAddRoute = () => {
    const responseId = crypto.randomUUID();
    const route: Route = {
      id: crypto.randomUUID(),
      name: t.routes.newRoute,
      method: 'GET',
      path: '/api/example',
      action: 'mock',
      enabled: true,
      mockResponseEnabled: true,
      mockRequestEnabled: false,
      responses: [{
        id: responseId,
        name: t.routes.defaultVariant,
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        rules: [],
      }],
      defaultResponseId: responseId,
      priority: 0,
    };
    addRoute(route);
  };

  const handleImportRoute = async () => {
    const route = await importRouteFromFile();
    if (!route) {
      showToast(t.routes.importFailed, 'error');
      return;
    }
    if (route.responses?.length) {
      route.defaultResponseId = route.responses[0].id;
    }
    addRoute(route);
  };

  const menuRoute = menu
    ? currentEnvironment.routes.find((route) => route.id === menu.id)
    : undefined;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>{t.routes.title}</span>
        <div style={styles.headerActions}>
          <button onClick={() => void handleImportRoute()} style={styles.headerBtn} title={t.routes.import}>
            ↓
          </button>
          <button onClick={handleAddRoute} style={styles.headerBtn} title={t.routes.add}>+</button>
        </div>
      </div>

      <div style={styles.list}>
        {currentEnvironment.routes.length === 0 ? (
          <div style={styles.empty}>{t.routes.empty}</div>
        ) : (
          currentEnvironment.routes.map((route) => {
            const applied = isRouteApplied(route);
            const isDuplicate = duplicateRouteIds.has(route.id);

            const isSelected = selectedRouteId === route.id;
            const defaultResponse = route.responses?.find((item) => item.id === route.defaultResponseId)
              ?? route.responses?.[0];
            const responseStatus = defaultResponse?.statusCode ?? 200;

            return (
              <div
                key={route.id}
                style={{
                  ...styles.item,
                  ...(isSelected ? styles.itemSelected : {}),
                  opacity: applied ? 1 : 0.72,
                }}
                onClick={() => setSelectedRouteId(route.id)}
                onContextMenu={(event) => {
                  setSelectedRouteId(route.id);
                  openFromContextMenu(event, route.id);
                }}
              >
                <div
                  style={{
                    ...styles.statusBar,
                    ...(isSelected ? styles.statusBarSelected : {}),
                    background: applied ? 'var(--accent)' : 'var(--warning)',
                  }}
                  title={applied ? t.routes.enabled : t.routes.disabled}
                />

                <div style={styles.itemBody}>
                  <div style={styles.itemTop}>
                    <MethodBadge method={route.method} />
                    {isDuplicate && (
                      <span style={styles.warning} title={t.routes.duplicateConflictTitle}>
                        ⚠
                      </span>
                    )}
                    <span style={styles.routeName}>{route.name}</span>
                  </div>
                  <div style={styles.path}>{route.path}</div>
                  <div style={styles.badges}>
                    {route.mockRequestEnabled && (
                      <span style={styles.kindBadgeReq}>{t.routes.mockRequestBadge}</span>
                    )}
                    {route.mockResponseEnabled !== false && route.responses?.length ? (
                      <span style={styles.kindBadgeRes}>
                        {t.routes.mockResponseBadge(responseStatus)}
                        {route.responses.length > 1 ? ` (+${route.responses.length - 1})` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div style={styles.menuWrap}>
                  <button
                    type="button"
                    style={styles.menuBtn}
                    onClick={(event) => openFromButton(event, route.id)}
                    aria-label={t.routes.menuActions}
                  >
                    ⋯
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      <RouteListMenu
        menu={menu}
        menuRef={menuRef}
        route={menuRoute}
        executingRouteId={executingRouteId}
        labels={{
          request: t.routes.tabRequest,
          response: t.routes.tabResponse,
          duplicate: t.routes.duplicateAction,
          export: t.routes.exportAction,
          import: t.routes.importAction,
          execute: t.routes.execute,
          executing: t.routes.executing,
          delete: t.routes.deleteAction,
          copyCurl: t.traffic.copyCurl,
        }}
        onRequestMockChange={(enabled) => {
          if (!menuRoute) return;
          setRouteMockEnabled(menuRoute.id, 'request', enabled);
        }}
        onResponseMockChange={(enabled) => {
          if (!menuRoute) return;
          setRouteMockEnabled(menuRoute.id, 'response', enabled);
        }}
        onDuplicate={() => {
          if (!menuRoute) return;
          duplicateRoute(menuRoute.id);
          closeMenu();
        }}
        onExport={() => {
          if (!menuRoute) return;
          downloadRouteJson(menuRoute);
          closeMenu();
        }}
        onImport={() => {
          closeMenu();
          void handleImportRoute();
        }}
        onCopyCurl={() => {
          if (!menuRoute) return;
          void copyRouteCurl(menuRoute);
          closeMenu();
        }}
        onExecute={() => {
          if (!menuRoute || executingRouteId) return;
          setExecutingRouteId(menuRoute.id);
          void executeRouteFromMenu(menuRoute).finally(() => {
            setExecutingRouteId(null);
            closeMenu();
          });
        }}
        onDelete={() => {
          if (!menuRoute) return;
          if (confirm(t.routes.deleteConfirm(menuRoute.name))) {
            deleteRoute(menuRoute.id);
          }
          closeMenu();
        }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  title: {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  headerActions: {
    display: 'flex',
    gap: '4px',
  },
  headerBtn: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  list: {
    flex: 1,
    overflow: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'stretch',
    cursor: 'pointer',
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.1s',
    minHeight: '64px',
  },
  itemSelected: {
    background: 'rgba(73, 204, 144, 0.14)',
    boxShadow: 'inset 0 0 0 1px rgba(73, 204, 144, 0.45)',
  },
  statusBar: {
    width: '4px',
    flexShrink: 0,
    transition: 'width 0.1s',
  },
  statusBarSelected: {
    width: '6px',
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  itemTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  warning: {
    fontSize: '11px',
    color: 'var(--warning)',
    flexShrink: 0,
  },
  routeName: {
    fontSize: '12px',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  path: {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  kindBadgeReq: {
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'var(--badge-request-bg)',
    color: 'var(--badge-request-color)',
    border: '1px solid rgba(73, 204, 144, 0.35)',
    whiteSpace: 'nowrap',
  },
  kindBadgeRes: {
    fontSize: '9px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '3px',
    background: 'var(--badge-response-bg)',
    color: 'var(--badge-response-color)',
    border: '1px solid rgba(97, 175, 254, 0.35)',
    whiteSpace: 'nowrap',
  },
  menuWrap: {
    display: 'flex',
    alignItems: 'center',
    paddingRight: '8px',
    flexShrink: 0,
  },
  menuBtn: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    color: 'var(--text-secondary)',
    fontSize: '16px',
    lineHeight: 1,
  },
  empty: {
    padding: '24px 12px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
};
