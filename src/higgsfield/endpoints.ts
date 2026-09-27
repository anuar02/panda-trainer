import { usageError } from "./errors";

export type Kind = "video" | "image" | "animate" | "refs";

export interface EndpointDef {
  kind: Kind;
  endpoint: string;
  label: string;
}

export const ENDPOINTS: Record<Kind, EndpointDef> = {
  video: {
    kind: "video",
    endpoint: "bytedance/seedance-2.0/text-to-video",
    label: "text-to-video (Seedance 2.0)",
  },
  image: {
    kind: "image",
    endpoint: "higgsfield-ai/soul/v2/standard",
    label: "text-to-image (SOUL 2)",
  },
  animate: {
    kind: "animate",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    label: "image-to-video (Seedance 2.0)",
  },
  refs: {
    kind: "refs",
    endpoint: "bytedance/seedance-2.0/reference-to-video",
    label: "reference-to-video (Seedance 2.0)",
  },
};

export interface GenerationOptions {
  prompt?: string;
  resolution?: string;
  duration?: number;
  aspect?: string;
  audio?: boolean;
  seed?: number;
  batch?: number;
  enhance?: boolean;
  style?: string;
  image?: string;
  endImage?: string;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
}

const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
const VIDEO_ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const IMAGE_RESOLUTIONS = ["720p", "1080p"];
const IMAGE_ASPECTS = ["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"];

function requirePrompt(prompt?: string): string {
  const value = prompt?.trim();
  if (!value) throw usageError("A non-empty --prompt is required.");
  return value;
}

function enumValue(
  value: string | undefined,
  allowed: string[],
  fallback: string,
  label: string,
): string {
  if (value === undefined) return fallback;
  const normalized = value.trim();
  if (!allowed.includes(normalized)) {
    throw usageError(`Invalid ${label} "${value}". Supported: ${allowed.join(", ")}.`);
  }
  return normalized;
}

function intRange(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw usageError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function requireUrl(value: string | undefined, label: string): string {
  const url = value?.trim();
  if (!url) throw usageError(`${label} is required.`);
  if (!/^https:\/\//i.test(url)) {
    throw usageError(`${label} must be a public https URL (or a local file path to upload).`);
  }
  return url;
}

function pickBatch(value?: number): number {
  if (value === undefined) return 1;
  if (value !== 1 && value !== 4) throw usageError("--batch must be 1 or 4.");
  return value;
}

export function buildInput(kind: Kind, options: GenerationOptions): Record<string, unknown> {
  switch (kind) {
    case "video":
      return {
        prompt: requirePrompt(options.prompt),
        resolution: enumValue(options.resolution, VIDEO_RESOLUTIONS, "720p", "resolution"),
        generate_audio: options.audio ?? true,
        duration: intRange(options.duration, 4, 15, 5, "--duration"),
        aspect_ratio: enumValue(options.aspect, VIDEO_ASPECTS, "16:9", "--aspect"),
      };

    case "image": {
      const input: Record<string, unknown> = {
        prompt: requirePrompt(options.prompt),
        aspect_ratio: enumValue(options.aspect, IMAGE_ASPECTS, "4:3", "--aspect"),
        resolution: enumValue(options.resolution, IMAGE_RESOLUTIONS, "720p", "resolution"),
        batch_size: pickBatch(options.batch),
        enhance_prompt: options.enhance ?? true,
      };
      if (options.seed !== undefined) {
        input.seed = intRange(options.seed, 1, 1000000, 1, "--seed");
      }
      if (options.style) input.style_id = options.style;
      return input;
    }

    case "animate": {
      if (options.aspect) {
        throw usageError(
          "image-to-video follows the input image's framing; --aspect is not supported for this endpoint.",
        );
      }
      const input: Record<string, unknown> = {
        image_url: requireUrl(options.image, "--image"),
        resolution: enumValue(options.resolution, VIDEO_RESOLUTIONS, "720p", "resolution"),
        generate_audio: options.audio ?? true,
        duration: intRange(options.duration, 4, 15, 5, "--duration"),
      };
      if (options.prompt?.trim()) input.prompt = options.prompt.trim();
      if (options.endImage) input.end_image_url = requireUrl(options.endImage, "--end-image");
      return input;
    }

    case "refs": {
      const imageUrls = [...(options.image ? [options.image] : []), ...options.imageUrls].map((url) =>
        requireUrl(url, "--image-url"),
      );
      if (imageUrls.length === 0 && options.videoUrls.length === 0) {
        throw usageError("reference-to-video needs at least one --image-url or --video-url.");
      }
      if (imageUrls.length > 9) {
        throw usageError("reference-to-video accepts at most 9 --image-url values.");
      }
      if (options.videoUrls.length > 3) {
        throw usageError("reference-to-video accepts at most 3 --video-url values.");
      }
      if (options.audioUrls.length > 3) {
        throw usageError("reference-to-video accepts at most 3 --audio-url values.");
      }
      const input: Record<string, unknown> = {
        prompt: requirePrompt(options.prompt),
        resolution: enumValue(options.resolution, VIDEO_RESOLUTIONS, "720p", "resolution"),
        generate_audio: options.audio ?? true,
        duration: intRange(options.duration, 4, 15, 5, "--duration"),
        aspect_ratio: enumValue(options.aspect, VIDEO_ASPECTS, "16:9", "--aspect"),
      };
      if (imageUrls.length) input.image_urls = imageUrls;
      if (options.videoUrls.length) {
        input.video_urls = options.videoUrls.map((url) => requireUrl(url, "--video-url"));
      }
      if (options.audioUrls.length) {
        input.audio_urls = options.audioUrls.map((url) => requireUrl(url, "--audio-url"));
      }
      return input;
    }
  }
}

function collectUrls(value: unknown): string[] {
  const urls: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = (item as { url?: unknown })?.url;
      if (typeof url === "string") urls.push(url);
    }
  }
  return urls;
}

export function extractMedia(response: Record<string, unknown>): string[] {
  const media = collectUrls(response.images);
  const video = response.video as { url?: unknown } | undefined;
  if (video && typeof video.url === "string") media.push(video.url);
  const audio = response.audio as { url?: unknown } | undefined;
  if (audio && typeof audio.url === "string") media.push(audio.url);
  media.push(...collectUrls(response.audios));
  return media;
}
