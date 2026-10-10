export type LocalEnvOptions = {
  filePath?: string;
  required?: boolean;
  override?: boolean;
  target?: Record<string, string | undefined>;
};

export function parseLocalEnv(contents: string): Record<string, string>;
export function readLocalEnvFile(filePath?: string, options?: { required?: boolean }): Record<string, string>;
export function loadLocalEnv(options?: LocalEnvOptions): Record<string, string>;
