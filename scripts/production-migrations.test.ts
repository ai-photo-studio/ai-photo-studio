import assert from "node:assert/strict";
import test from "node:test";
import { hasPendingMigrationsInOutput, prismaArgs, validateMigrationEnvironment } from "./production-migrations";

const validUrl = "postgresql://operator:secret@127.0.0.1:55479/release";

test("status accepts a valid process-only PostgreSQL URL without apply authorization", () => {
  assert.deepEqual(validateMigrationEnvironment({ DATABASE_URL: validUrl }, "status"), { databaseUrl: validUrl });
});

test("apply requires explicit production migration authorization", () => {
  assert.throws(() => validateMigrationEnvironment({ DATABASE_URL: validUrl }, "apply"), /ALLOW_PRODUCTION_MIGRATIONS=true/);
  assert.deepEqual(validateMigrationEnvironment({ DATABASE_URL: validUrl, ALLOW_PRODUCTION_MIGRATIONS: "true" }, "apply"), { databaseUrl: validUrl });
});

test("missing, malformed, and placeholder URLs fail closed", () => {
  assert.throws(() => validateMigrationEnvironment({}, "status"), /DATABASE_URL is required/);
  assert.throws(() => validateMigrationEnvironment({ DATABASE_URL: "not-a-url" }, "status"), /valid PostgreSQL URL/);
  assert.throws(() => validateMigrationEnvironment({ DATABASE_URL: "https://example.invalid/db" }, "status"), /postgres/);
  assert.throws(() => validateMigrationEnvironment({ DATABASE_URL: "postgresql://placeholder/db" }, "status"), /configured PostgreSQL host/);
});

test("pending-migration detection matches Prisma's real singular and plural wording", () => {
  assert.equal(hasPendingMigrationsInOutput("Following migration have not yet been applied:\n20260810000000_x\n"), true);
  assert.equal(hasPendingMigrationsInOutput("Following migrations have not yet been applied:\n20260808000000_a\n20260809000000_b\n"), true);
  assert.equal(hasPendingMigrationsInOutput("Database schema is up to date!"), false);
  assert.equal(hasPendingMigrationsInOutput(""), false);
});

test("only status and deploy Prisma commands can be constructed", () => {
  assert.deepEqual(prismaArgs("status").slice(1), ["migrate", "status", "--schema", "apps/api/prisma/schema.prisma"]);
  assert.deepEqual(prismaArgs("deploy").slice(1), ["migrate", "deploy", "--schema", "apps/api/prisma/schema.prisma"]);
  assert.throws(() => prismaArgs("dev" as never), /Unsupported migration command/);
});
