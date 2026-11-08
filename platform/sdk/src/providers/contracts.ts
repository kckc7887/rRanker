import type { Credential } from '@rranker/sdk/credentials';

export interface LoginCredentials { username: string; password: string }

export interface AuthProvider {
  loginWithPassword(credentials: LoginCredentials): Promise<Credential>;
  useImportToken(token: string): Credential;
}
