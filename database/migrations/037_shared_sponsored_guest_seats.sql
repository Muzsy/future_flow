-- Sponsored participation is separate from subscription-owned Shared slots.
-- Existing memberships remain subscriber-backed; only explicit future admissions
-- may become sponsored guests.
ALTER TABLE aw_shared_members
  ADD COLUMN entitlement_mode text NOT NULL DEFAULT 'subscriber'
  CHECK(entitlement_mode IN ('subscriber','sponsored_guest'));

ALTER TABLE aw_shared_members
  ADD CONSTRAINT aw_shared_sponsored_guest_friend_only
  CHECK(entitlement_mode <> 'sponsored_guest' OR context_type='friend_group');

-- A user may consume at most one live sponsored guest seat. Paid/subscriber
-- memberships are counted separately by the application tier limits.
CREATE UNIQUE INDEX aw_shared_one_live_sponsored_guest
  ON aw_shared_members(user_id)
  WHERE user_id IS NOT NULL
    AND entitlement_mode='sponsored_guest'
    AND context_live
    AND status IN ('active','paused_entitlement');
