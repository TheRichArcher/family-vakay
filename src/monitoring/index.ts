export const monitoringEnabled = false;

export function initMonitoring(): void {
  return;
}

export function setUserContext(user: { id?: string; email?: string | null; username?: string | null; family_id?: string | null } | null): void {
  void user;
}

export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, unknown>;
}): void {
  void breadcrumb;
}

export function captureException(error: unknown, context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): void {
  void error;
  void context;
}

