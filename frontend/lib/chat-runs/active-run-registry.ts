const controllers = new Map<string, AbortController>();

export function registerActiveChatRun(runId: string) {
  const controller = new AbortController();
  controllers.set(runId, controller);
  return controller;
}

export function releaseActiveChatRun(runId: string) {
  controllers.delete(runId);
}

export function abortActiveChatRun(runId: string) {
  const controller = controllers.get(runId);
  controller?.abort();
  return Boolean(controller);
}
