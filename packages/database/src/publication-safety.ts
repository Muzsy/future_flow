import { DomainError } from '@future-flow/core';
import type { Database } from './index';
// The caller holds the publisher's user lock. Reads, withdrawal and private
// continuation remain available; only preparation and Confirm use this gate.
export async function assertPublicationAllowed(tx: Database, userId: string) {
  const [storage] = await tx.query(
    "SELECT to_regclass('public.aw_publication_restrictions') IS NOT NULL AS present",
  );
  if (storage?.present === true) {
    const [row] = await tx.query<{ active: boolean }>(
      'SELECT active FROM aw_publication_restrictions WHERE user_id=$1',
      [userId],
    );
    if (row?.active)
      throw new DomainError(
        'PUBLICATION_RESTRICTED',
        'Publishing is restricted for this account.',
        403,
      );
  }
}
