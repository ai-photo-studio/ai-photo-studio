import { spawnSync } from "node:child_process";

const SCHEMA_PATH = "apps/api/prisma/schema.prisma";
const APPLY_CONFIRMATION = "ALLOW_PRODUCTION_MIGRATIONS";
const PRISMA_CLI = require.resolve("prisma/build/index.js");

export type MigrationMode = "status" | "apply";

function redact(value: string, databaseUrl: string): string {
  let output = value;
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) output = output.split(parsed.password).join("[REDACTED]");
    parsed.password = "[REDACTED]";
    output = output.split(databaseUrl).join(parsed.toString());
  } catch {
    // Validation runs before command execution; retain generic redaction below.
  }
  return output.replace(/(postgres(?:ql)?:\/\/[^\s:@]+:)[^\s@]+(@)/gi, "$1[REDACTED]$2");
}

export function validateMigrationEnvironment(env: NodeJS.ProcessEnv, mode: MigrationMode): { databaseUrl: string } {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgres:// or postgresql://");
  }
  if (!parsed.hostname || parsed.hostname.includes("placeholder") || parsed.hostname.includes("example")) {
    throw new Error("DATABASE_URL must point to a configured PostgreSQL host");
  }
  if (mode === "apply" && env[APPLY_CONFIRMATION] !== "true") {
    throw new Error(`${APPLY_CONFIRMATION}=true is required for migration apply`);
  }
  return { databaseUrl };
}

export function prismaArgs(mode: "status" | "deploy"): string[] {
  if (mode !== "status" && mode !== "deploy") throw new Error("Unsupported migration command");
  return [PRISMA_CLI, "migrate", mode, "--schema", SCHEMA_PATH];
}

function runPrisma(mode: "status" | "deploy", databaseUrl: string): { status: number; output: string } {
  const result = spawnSync(process.execPath, prismaArgs(mode), {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    windowsHide: true
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (output) process.stdout.write(redact(output, databaseUrl));
  if (result.error) throw new Error(`Prisma migrate ${mode} could not start: ${result.error.message}`);
  return { status: result.status ?? 1, output };
}

// R9.5-P5R4: Prisma singularizes this message when exactly one migration is
// pending ("Following migration have not yet been applied:", no "s") and
// pluralizes it otherwise. The previous hardcoded-plural regex never matched
// the single-pending case, so `apply` treated `migrate status`'s normal
// exit-1-because-pending result as a hard failure and aborted before ever
// running `migrate deploy` -- exported as a pure function so this exact
// wording contract is unit-testable without mocking spawnSync.
export function hasPendingMigrationsInOutput(output: string): boolean {
  return /Following migrations? have not yet been applied:/i.test(output);
}

export function runMigrationCommand(mode: MigrationMode, env: NodeJS.ProcessEnv = process.env): void {
  const { databaseUrl } = validateMigrationEnvironment(env, mode);
  console.log(`Production migration ${mode}: schema=${SCHEMA_PATH}`);
  const before = runPrisma("status", databaseUrl);
  const hasPendingMigrations = hasPendingMigrationsInOutput(before.output);
  if (before.status !== 0 && !(mode === "apply" && hasPendingMigrations)) {
    throw new Error(`Prisma migrate status failed with exit code ${before.status}`);
  }
  if (mode === "apply") {
    console.log("Applying only checked-in Prisma migrations with migrate deploy.");
    const deploy = runPrisma("deploy", databaseUrl);
    if (deploy.status !== 0) throw new Error(`Prisma migrate deploy failed with exit code ${deploy.status}`);
    const after = runPrisma("status", databaseUrl);
    if (after.status !== 0) throw new Error(`Prisma migrate status after apply failed with exit code ${after.status}`);
  }
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode !== "status" && mode !== "apply") {
    console.error("Usage: npm run db:migrate:status:production | npm run db:migrate:production");
    process.exitCode = 2;
  } else {
    try {
      runMigrationCommand(mode);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Production migration command failed");
      process.exitCode = 1;
    }
  }
}
