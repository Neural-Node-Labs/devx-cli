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
