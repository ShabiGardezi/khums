import { Inject, Injectable } from '@nestjs/common';

import { staffRepository } from './staff-repository';
import { STAFF_STORE, type StaffStore } from './staff-store';

/**
 * Staff usernames by principal id, so the console shows people by name, never by internal id
 * (decision 79). Read-only; unknown ids (AI imports, the system, removed accounts) are absent.
 */
@Injectable()
export class StaffNamesService {
  constructor(@Inject(STAFF_STORE) private readonly store: StaffStore) {}

  async names(): Promise<ReadonlyMap<string, string>> {
    const all = await staffRepository(this.store.collections).allAccounts();
    return all.ok ? new Map(all.value.map((a) => [a.principalId, a.username])) : new Map();
  }
}
