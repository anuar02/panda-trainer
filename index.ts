import { config as loadEnv } from "dotenv";
import { run } from "./src/higgsfield/cli";
import { CliError, ExitCode } from "./src/higgsfield/errors";

loadEnv({ path: ".env.local", quiet: true });

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`higgsfield: ${message}\n`);
    process.exitCode = error instanceof CliError ? error.exitCode : ExitCode.ERROR;
  });
