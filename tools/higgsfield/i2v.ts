import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { config, higgsfield } from "@higgsfield/client/v2";

const [keyframe, promptFile, outFile, durationArg = "4", resolution = "1080p"] = process.argv.slice(2);
if (!keyframe || !promptFile || !outFile) {
  console.error("usage: node i2v.ts <keyframe.png> <prompt.txt> <out.mp4> [duration=4] [resolution=1080p]");
  process.exit(1);
}

const credentials = process.env.HF_CREDENTIALS;
if (!credentials || !credentials.includes(":")) {
  console.error("HF_CREDENTIALS is missing or not in key-id:key-secret format");
  process.exit(1);
}
config({ credentials });

const auth = { Authorization: `Key ${credentials}` };
const slot = await fetch("https://api.higgsfield.ai/files/generate-upload-url", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ content_type: "image/png" }),
});
if (!slot.ok) {
  console.error(`upload slot failed: HTTP ${slot.status}`);
  process.exit(1);
}
const { upload_url, public_url } = (await slot.json()) as { upload_url: string; public_url: string };
const put = await fetch(upload_url, {
  method: "PUT",
  headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" },
  body: await readFile(keyframe),
});
if (!put.ok) {
  console.error(`keyframe upload failed: HTTP ${put.status}`);
  process.exit(1);
}

const input = {
  prompt: (await readFile(promptFile, "utf8")).trim(),
  image_url: public_url,
  end_image_url: public_url,
  duration: Number(durationArg),
  resolution,
  generate_audio: false,
};
console.log(`submitting: seedance-2.5 image-to-video, ${input.duration}s, ${resolution}, audio off`);

const result = await higgsfield.subscribe("bytedance/seedance-2.5/image-to-video", { input, withPolling: true });
const status: string = result.status;
console.log(`request ${result.request_id}: ${status}`);
const url = result.video?.url;
if (status !== "completed" || !url) {
  console.error(`no video produced (status=${status})`);
  process.exit(2);
}
console.log(`video: ${url}`);

const video = await fetch(url);
if (!video.ok) {
  console.error(`download failed: HTTP ${video.status}; video URL above is still valid`);
  process.exit(3);
}
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, Buffer.from(await video.arrayBuffer()));
await writeFile(`${outFile}.json`, JSON.stringify({ request_id: result.request_id, url, input: { ...input, image_url: "<uploaded keyframe>", end_image_url: "<uploaded keyframe>" } }, null, 2));
console.log(`saved: ${outFile}`);
