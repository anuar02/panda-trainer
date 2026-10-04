import { config, higgsfield } from "@higgsfield/client/v2";
import {
  APIError,
  AuthenticationError,
  BadInputError,
  NotEnoughCreditsError,
  ValidationError,
} from "@higgsfield/client";

const credentials = process.env.HF_CREDENTIALS;
if (!credentials || !credentials.includes(":")) {
  console.error("HF_CREDENTIALS is missing or not in key-id:key-secret format (set it in tools/higgsfield/.env.local)");
  process.exit(1);
}

config({ credentials });

try {
  const result = await higgsfield.subscribe("bytedance/seedance-2.5/text-to-video", {
    input: {
      prompt: "A cinematic scene at sunset",
      duration: 5,
      resolution: "1080p",
      aspect_ratio: "16:9",
    },
    withPolling: true,
  });

  const status: string = result.status;
  const url = result.video?.url;
  console.log(`request ${result.request_id}: ${status}`);

  if (status === "completed" && url) {
    console.log(`completed: ${url}`);
  } else if (status === "nsfw") {
    console.error("rejected by moderation (nsfw); no video produced");
    process.exitCode = 2;
  } else if (status === "failed") {
    console.error("generation failed; no video produced");
    process.exitCode = 2;
  } else if (status === "canceled") {
    console.error("generation canceled; no video produced");
    process.exitCode = 2;
  } else {
    console.error(`unexpected result: status=${String(status)} url=${url ? "present" : "missing"}`);
    process.exitCode = 2;
  }
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error("authentication failed: check HF_CREDENTIALS");
  } else if (error instanceof NotEnoughCreditsError) {
    console.error("not enough credits");
  } else if (error instanceof BadInputError || error instanceof ValidationError) {
    console.error(`invalid input: ${error.message}`);
  } else if (error instanceof APIError) {
    console.error(`API error ${error.statusCode}: ${error.message}`);
  } else {
    console.error("unexpected error:", error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
