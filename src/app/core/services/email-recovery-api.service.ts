import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface SendPinResponse {
  sent: boolean;
  expiresInSeconds: number;
  devPin?: string;
}

export interface VerifyPinResponse {
  verified: boolean;
  token: string;
  expiresInSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class EmailRecoveryApiService {
  private readonly http = inject(HttpClient);

  sendPin(email: string): Promise<SendPinResponse> {
    return firstValueFrom(this.http.post<SendPinResponse>('/api/recovery/send-pin', { email }));
  }

  verifyPin(email: string, pin: string): Promise<VerifyPinResponse> {
    return firstValueFrom(
      this.http.post<VerifyPinResponse>('/api/recovery/verify-pin', {
        email,
        pin: pin.replace(/\D/g, ''),
      }),
    );
  }
}
