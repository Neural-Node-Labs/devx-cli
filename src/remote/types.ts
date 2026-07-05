/**
 * @file src/remote/types.ts
 * @version 0.2.0
 * @sea-cli-instruction Increment @version above whenever this file is modified.
 */
export interface SshTarget {
  host: string;
  port: number;
}

export interface RemoteAuth {
  user: string;
  password: string;
}

export interface RemoteConfig {
  targets: SshTarget[];
  auth: RemoteAuth;
}
