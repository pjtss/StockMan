export function withLocalFileLock<T>(lockPath: string, task: () => T, options?: { timeoutMs?: number }): T;
