import { Injectable } from '@nestjs/common';
import { Subject, type Observable } from 'rxjs';

export type LiveChangeReason =
  'member-joined' | 'member-left' | 'member-updated' | 'verification-submitted';

export interface LiveChange {
  reason: LiveChangeReason;
  at: string;
}

/**
 * In-process signal that member data changed. The admin page listens over
 * Server-Sent Events and reloads its data when it fires.
 */
@Injectable()
export class LiveUpdatesService {
  private readonly subject = new Subject<LiveChange>();

  readonly changes: Observable<LiveChange> = this.subject.asObservable();

  notify(reason: LiveChangeReason): void {
    this.subject.next({ reason, at: new Date().toISOString() });
  }
}
