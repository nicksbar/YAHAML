#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const dbUrl = process.env.DATABASE_URL || '';
const explicitSchema = process.env.PRISMA_SCHEMA;

const inferredSchema = /^postgres(ql)?:\/\//i.test(dbUrl)
  ? './prisma/schema.postgres.prisma'
  : './prisma/schema.prisma';

const schema = explicitSchema || inferredSchema;

console.log(`[prisma] DATABASE_URL=${dbUrl ? '(set)' : '(unset)'} -> schema ${schema}`);

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(
  npxCommand,
  ['prisma', 'generate', '--schema', schema],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_SCHEMA: schema,
    },
  },
);

if (typeof result.status !== 'number' || result.status !== 0) {
  process.exit(result.status || 1);
}
