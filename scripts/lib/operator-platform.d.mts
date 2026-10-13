export function supportedOperatorPlatform(platform?: string): boolean;
export function sameOperatorPath(
  left: string,
  right: string,
  platform?: string,
): boolean;
export function assertLinuxPrivatePath(path: string, directory?: boolean): void;
export function assertOperatorLocalInput(path: string): void;
export function operatorSecretsDirectory(
  environment?: NodeJS.ProcessEnv,
): string;

export function operatorCiReadToken(): string;

export function operatorInputMaximum(path: string): number;
