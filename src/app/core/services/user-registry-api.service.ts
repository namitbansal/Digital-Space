import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  RegisterUserInput,
  UpdateUserRegistryInput,
  UserRegistryRecord,
} from '../models/user-registry.models';
import { normalizeUsername } from '../utils/username';

@Injectable({ providedIn: 'root' })
export class UserRegistryApiService {
  private readonly http = inject(HttpClient);

  checkUsernameAvailable(username: string): Promise<{ available: boolean }> {
    const u = normalizeUsername(username);
    return firstValueFrom(this.http.get<{ available: boolean }>(`/api/users/${encodeURIComponent(u)}/available`));
  }

  registerUser(input: RegisterUserInput): Promise<UserRegistryRecord> {
    return firstValueFrom(
      this.http.post<UserRegistryRecord>('/api/users/register', {
        ...input,
        username: normalizeUsername(input.username),
      }),
    );
  }

  lookupUser(username: string): Promise<UserRegistryRecord> {
    const u = normalizeUsername(username);
    return firstValueFrom(this.http.get<UserRegistryRecord>(`/api/users/${encodeURIComponent(u)}`));
  }

  verifyLogin(username: string, password: string): Promise<{ ok: boolean; profile: UserRegistryRecord }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; profile: UserRegistryRecord }>('/api/users/verify-login', {
        username: normalizeUsername(username),
        password,
      }),
    );
  }

  updateUser(username: string, patch: UpdateUserRegistryInput): Promise<UserRegistryRecord> {
    const u = normalizeUsername(username);
    return firstValueFrom(this.http.patch<UserRegistryRecord>(`/api/users/${encodeURIComponent(u)}`, patch));
  }
}
