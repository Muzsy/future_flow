import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  profileSchema,
  stateSchema,
  simulationOutputSchema,
  chapterOutputSchema,
  fidelitySchema,
  CONTRACT_VERSION,
} from './index';

const directory = resolve(__dirname, '../../../docs/contracts');
mkdirSync(directory, { recursive: true });
for (const [name, schema] of Object.entries({
  profile: profileSchema,
  lifeState: stateSchema,
  simulationOutput: simulationOutputSchema,
  chapterOutput: chapterOutputSchema,
  fidelity: fidelitySchema,
})) {
  writeFileSync(
    resolve(directory, `${name}.schema.json`),
    JSON.stringify(
      {
        $id: `urn:future-flow:${name}:${CONTRACT_VERSION}`,
        ...z.toJSONSchema(schema),
      },
      null,
      2,
    ) + '\n',
  );
}
