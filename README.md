# Alterward

Alterward is an AI-based alternative-life simulation platform: persistent world state, meaningful choices, consequences, continuation and branching rather than one-off LLM chat.

## Current release posture

The personal beta is technically prepared but **not active yet**. Shared Context is implemented in substantial parts but remains disabled for the first personal beta. Billing/checkout/webhook are not yet implemented as a production payment lifecycle.

Current state: [`docs/STATUS_HU.md`](docs/STATUS_HU.md)  
Roadmap: [`docs/ROADMAP_HU.md`](docs/ROADMAP_HU.md)

## Repository architecture

```text
apps/
  web/       web client
  api/       HTTP/API boundary
  worker/    async AI/background jobs
packages/
  access/    auth/access helpers
  contracts/ runtime/type contracts and schemas
  core/      domain logic and invariants
  database/  persistence/repositories/migrations
  ai/        AI/provider integration
```

Canonical architecture: [`docs/architecture/ARCHITECTURE_HU.md`](docs/architecture/ARCHITECTURE_HU.md).

## For developers and AI agents

Read in this order:

1. [`AGENTS.md`](AGENTS.md)
2. [`docs/DOCS_INDEX_HU.md`](docs/DOCS_INDEX_HU.md)
3. [`docs/STATUS_HU.md`](docs/STATUS_HU.md)
4. the task-specific canonical specification selected by the Docs Index

Do not treat old audits, reports or dated checkpoints as current source of truth.

## Development

Requirements:

- Node.js 24
- pnpm 11.19

Typical verification:

```bash
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm schemas
```

Setup and operations are documented under `docs/operations/` and the active detailed runbooks linked from the Docs Index.

## Product

Canonical product definition: [`docs/product/PRODUCT_HU.md`](docs/product/PRODUCT_HU.md).

Core simulation model:

`Profile → WorldState → Event → Choice → Consequence → new WorldState`

The validated structured state is authoritative; AI-generated prose is a presentation/narrative layer over that state.

## Documentation policy

Documentation governance: [`docs/DOCUMENTATION_GOVERNANCE_HU.md`](docs/DOCUMENTATION_GOVERNANCE_HU.md).

The repository is the durable shared memory for humans and agents. Canonical docs, ADRs, code/contracts and tests take precedence over chat history or agent memory.
