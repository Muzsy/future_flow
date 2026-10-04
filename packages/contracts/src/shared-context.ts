import { z } from 'zod';

export const SHARED_CONTEXT_CONTRACT_VERSION = '1.0.0';
const id = z.uuid();
const label = z.string().trim().min(1).max(160);
const revision = z.number().int().nonnegative();
export const sharedContextTypeSchema = z.enum([
  'friend_group',
  'romantic_relationship',
  'work_project',
  'hobby_group',
  'sports_team',
]);
export type SharedContextType = z.infer<typeof sharedContextTypeSchema>;
export const sharedContextStatusSchema = z.enum([
  'inviting',
  'active',
  'paused',
  'ended',
  'archived',
]);
export const sharedMemberStatusSchema = z.enum([
  'active',
  'paused_entitlement',
  'left',
  'removed',
  'deleted',
]);
export const sharedTierSchema = z.enum([
  'free',
  'explorer',
  'connected',
  'world',
]);
export type SharedTier = z.infer<typeof sharedTierSchema>;
export const sharedPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('individual_opt_in') }).strict(),
  z.object({ type: z.literal('majority') }).strict(),
  z.object({ type: z.literal('unanimous') }).strict(),
  z.object({ type: z.literal('role_authority'), role: label }).strict(),
  z
    .object({
      type: z.literal('weighted_vote'),
      weights: z.record(id, z.number().positive()),
    })
    .strict(),
]);
export type SharedPolicy = z.infer<typeof sharedPolicySchema>;
export const interactionProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    ageBand: z
      .enum(['18_24', '25_34', '35_44', '45_54', '55_64', '65_plus'])
      .nullable(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    occupationLabel: label.nullable(),
    sharedRole: label.nullable(),
  })
  .strict();
export type InteractionProfile = z.infer<typeof interactionProfileSchema>;
export const socialProfileSchema = z
  .object({
    handle: z.string().regex(/^[a-z0-9][a-z0-9_]{2,29}$/),
    displayName: interactionProfileSchema.shape.displayName,
    discoverability: z.enum(['private', 'link_only', 'searchable']),
  })
  .strict();
export type SocialProfile = z.infer<typeof socialProfileSchema>;
export const sharedStateSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('friend_group'),
      summary: label.nullable(),
      cohesion: z.enum(['low', 'medium', 'high']).nullable(),
      currentFocus: label.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('romantic_relationship'),
      summary: label.nullable(),
      stage: z.enum([
        'dating',
        'committed',
        'cohabiting',
        'engaged',
        'married',
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal('work_project'),
      summary: label.nullable(),
      projectKind: label,
      goal: label,
      progress: z.enum(['planned', 'active', 'completed', 'cancelled']),
    })
    .strict(),
  z
    .object({
      type: z.literal('hobby_group'),
      summary: label.nullable(),
      activity: label,
      currentFocus: label.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('sports_team'),
      summary: label.nullable(),
      sport: label,
      seasonStatus: z.enum(['preseason', 'active', 'completed']),
      teamGoal: label.nullable(),
    })
    .strict(),
]);
export type SharedState = z.infer<typeof sharedStateSchema>;
export const sharedChangeSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('summary_set'), value: label.nullable() })
    .strict(),
  z
    .object({
      type: z.literal('friend_group_cohesion_set'),
      value: z.enum(['low', 'medium', 'high']).nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('friend_group_focus_set'),
      value: label.nullable(),
    })
    .strict(),
]);
export const sharedImpactProposalSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('memory_only'),
      memberId: id,
      summary: z.string().trim().min(1).max(600),
    })
    .strict(),
  z
    .object({
      type: z.literal('relationship_projection'),
      memberId: id,
      relationship: z.enum(['friend', 'colleague', 'teammate', 'partner']),
      authoritySource: z.enum(['shared_canon', 'self_intent']),
    })
    .strict(),
]);
export const sharedEventCandidateSchema = z
  .object({
    schemaVersion: z.literal(SHARED_CONTEXT_CONTRACT_VERSION),
    eventId: id,
    contextId: id,
    baseRevision: revision,
    effectiveAt: z.iso.date(),
    title: label,
    summary: z.string().trim().min(1).max(1200),
    participantMemberIds: z.array(id).min(1).max(20),
    sharedChanges: z.array(sharedChangeSchema).max(10),
    decision: z
      .object({
        id,
        prompt: z.string().trim().min(1).max(600),
        policy: sharedPolicySchema,
        eligibleMemberIds: z.array(id).min(1).max(20),
        deadlineSeconds: z.number().int().min(60).max(604800).nullable(),
        options: z
          .array(
            z
              .object({
                id,
                label,
                description: z.string().trim().min(1).max(600),
                sharedChanges: z.array(sharedChangeSchema).max(10),
                impactProposals: z.array(sharedImpactProposalSchema).max(40),
              })
              .strict(),
          )
          .min(2)
          .max(5),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type SharedEventCandidate = z.infer<typeof sharedEventCandidateSchema>;
export const sharedCreateRequestSchema = z
  .object({
    type: sharedContextTypeSchema,
    title: label,
    branchId: id,
    revision,
    sharingAcknowledged: z.literal(true),
    interactionProfile: interactionProfileSchema.optional(),
  })
  .strict();
export type SharedCreateRequest = z.infer<typeof sharedCreateRequestSchema>;
export const sharedInviteRequestSchema = z
  .object({
    contextRevision: revision,
    targetUserId: id.optional(),
  })
  .strict();
export type SharedInviteRequest = z.infer<typeof sharedInviteRequestSchema>;
export const sharedInviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const sharedInvitePreviewRequestSchema = z
  .object({ token: sharedInviteTokenSchema })
  .strict();
export const sharedAcceptRequestSchema = z
  .object({
    token: sharedInviteTokenSchema,
    branchId: id,
    revision,
    contextRevision: revision,
    sharingAcknowledged: z.literal(true),
    interactionProfile: interactionProfileSchema.optional(),
  })
  .strict();
export type SharedAcceptRequest = z.infer<typeof sharedAcceptRequestSchema>;
export const sharedDeclineRequestSchema = sharedInvitePreviewRequestSchema;
export const sharedRevisionRequestSchema = z
  .object({ contextRevision: revision })
  .strict();
export const sharedMemoryEventSchema = z
  .object({
    contextId: id,
    contextType: sharedContextTypeSchema,
    effectiveAt: z.iso.date(),
    title: label,
    summary: z.string().trim().min(1).max(1200),
    role: label.nullable(),
  })
  .strict();
export type SharedMemoryEvent = z.infer<typeof sharedMemoryEventSchema>;

export const sharedErrorMessages: Record<string, readonly [string, string]> = {
  SHARED_REQUEST_INTERRUPTED: [
    'This AI request was interrupted. Start a new generation when ready.',
    'Az AI-kérés megszakadt. Szükség esetén indíts új generálást.',
  ],
  SHARED_REPAIR_EXHAUSTED: [
    'The shared proposal could not be validated.',
    'A közös eseményjavaslat nem volt validálható.',
  ],
  SHARED_CANDIDATE_INVALID: [
    'This shared event is invalid.',
    'A közös esemény érvénytelen.',
  ],
  SHARED_IMPACT_INVALID: [
    'This personal effect is not permitted.',
    'Ez a személyes hatás nem engedett.',
  ],
  SHARED_DECISION_CLOSED: [
    'This shared decision is closed.',
    'Ez a közös döntés lezárult.',
  ],
  SHARED_CONTEXT_NOT_FOUND: [
    'This shared context is unavailable.',
    'A közös kontextus nem érhető el.',
  ],
  SHARED_CONTEXT_FULL: [
    'This group has reached its member limit.',
    'A csoport elérte a taglimitet.',
  ],
  SHARED_CONTEXT_LIMIT: [
    'Your plan has reached its shared context limit.',
    'A csomagod elérte a közös kontextusok limitjét.',
  ],
  SHARED_CONTEXT_TYPE_NOT_ALLOWED: [
    'This shared context type is not available.',
    'Ez a közös kontextustípus nem érhető el.',
  ],
  SHARED_ROMANTIC_LIMIT: [
    'You already have an active romantic context.',
    'Már van aktív párkapcsolati kontextusod.',
  ],
  SHARED_INVITE_INVALID: [
    'This invitation is unavailable.',
    'A meghívó nem érhető el.',
  ],
  SHARED_INVITE_EXPIRED: ['This invitation has expired.', 'A meghívó lejárt.'],
  SHARED_INVITE_ALREADY_USED: [
    'This invitation is no longer pending.',
    'A meghívó már nem függő állapotú.',
  ],
  SHARED_TIME_MISMATCH: [
    'The life branches must be at a compatible simulation date.',
    'Az életágak szimulációs dátuma nem összeegyeztethető.',
  ],
  SHARED_REVISION_CONFLICT: [
    'The shared context changed. Reload it before trying again.',
    'A közös kontextus megváltozott. Töltsd újra.',
  ],
  SHARED_PENDING_DECISION: [
    'Respond to the pending shared decision first.',
    'Előbb válaszolj a függő közös döntésre.',
  ],
  SHARED_INTENT_ALREADY_SUBMITTED: [
    'Your response has already been submitted.',
    'A válaszodat már leadtad.',
  ],
  SHARED_INTENT_NOT_ELIGIBLE: [
    'You are not eligible to respond to this decision.',
    'Erre a döntésre nem adhatsz választ.',
  ],
  SHARED_POLICY_UNRESOLVED: [
    'This shared decision has not been resolved.',
    'A közös döntés még nincs lezárva.',
  ],
  SHARED_GENERATION_ACTIVE: [
    'A shared event is already being generated.',
    'Már folyamatban van közös generálás.',
  ],
  SHARED_MEMBER_INACTIVE: [
    'Your membership does not allow this action.',
    'A tagságod nem engedi ezt a műveletet.',
  ],
  SHARED_PERMISSION_DENIED: [
    'You do not have permission for this action.',
    'Nincs jogosultságod ehhez a művelethez.',
  ],
  SHARED_BLOCKED: [
    'This invitation or interaction is unavailable.',
    'Ez a meghívás vagy interakció nem érhető el.',
  ],
  SHARED_PROFILE_REQUIRED: [
    'Set up your social profile before joining a shared context.',
    'Állítsd be a kapcsolati profilodat a csatlakozás előtt.',
  ],
  SHARED_HANDLE_UNAVAILABLE: [
    'This handle is already in use.',
    'Ez a felhasználónév már foglalt.',
  ],
  SHARED_INVITE_CONFIG: [
    'Invitations are temporarily unavailable.',
    'A meghívók átmenetileg nem érhetők el.',
  ],
  SHARED_INVITE_LIMIT: [
    'Too many invitations. Try again later.',
    'Túl sok meghívó. Próbáld később.',
  ],
  SUBSCRIPTION_REQUIRED: [
    'Your plan does not include this shared context type.',
    'A csomagod nem tartalmazza ezt a közös kontextustípust.',
  ],
};
