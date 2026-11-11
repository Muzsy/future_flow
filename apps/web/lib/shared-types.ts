import type {
  InteractionProfile,
  SharedTier,
  SocialProfile,
} from '@future-flow/contracts';

export type Social = {
  profile: SocialProfile | null;
  entitlement: { tier: SharedTier; activeContexts: number };
};
export type Connection = {
  id: string;
  title: string;
  status: string;
  revision: number;
  simulation_at: string;
  memberId: string;
  membershipStatus: string;
  moderationHold: boolean;
};
export type SharedGeneration = {
  id: string;
  status: string;
  stage: string;
  errorCode: string | null;
};
export type ConnectionDetail = {
  id: string;
  title: string;
  status: string;
  revision: number;
  simulationAt: string;
  ownMemberId: string;
  pendingEventId: string | null;
  moderationHold: boolean;
  generation: SharedGeneration | null;
  members: {
    id: string;
    status: string;
    adminRole: string;
    interactionProfile: InteractionProfile;
    branchId?: string;
  }[];
};
export type SharedEvent = {
  id: string;
  title: string;
  summary: string;
  effectiveAt: string;
  participantMemberIds: string[];
  responseCount: number;
  privacyRedacted?: boolean;
  decision: {
    id: string;
    prompt: string;
    eligibleMemberIds: string[];
    closesAt: string | null;
    options: { id: string; label: string; description: string }[];
  } | null;
  ownResponse: { optionId: string } | null;
  resolution: {
    status: string;
    reason: string;
    participatingMemberIds: string[];
    participatingCount?: number;
  } | null;
};
export type InvitePreview = {
  inviteId: string;
  contextId: string;
  title: string;
  inviter: string;
  contextRevision: number;
  simulationAt: string;
  expiresAt: string;
  canDecline: boolean;
};
export type OwnBranch = {
  id: string;
  revision: number;
  status: string;
  state: { effectiveAt: string };
};
