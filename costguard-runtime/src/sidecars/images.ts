export type ImageSidecarRequest = {
  prompt: string;
  size?: string;
  model?: string;
};

export type ImageSidecarResult =
  | { status: "PRESENT"; artifactId: string; mimeType: string }
  | { status: "UNKNOWN"; failClosed: true; reason: "image-adapter-not-configured" | "image-prompt-invalid" | "image-adapter-failed" };

export type ImageSidecarAdapter = {
  invoke: (request: ImageSidecarRequest) => Promise<Extract<ImageSidecarResult, { status: "PRESENT" }>>;
};

export async function invokeImageSidecar(
  request: ImageSidecarRequest,
  adapter?: ImageSidecarAdapter,
): Promise<ImageSidecarResult> {
  if (typeof request.prompt !== "string" || request.prompt.trim().length === 0) {
    return { status: "UNKNOWN", failClosed: true, reason: "image-prompt-invalid" };
  }
  if (!adapter) return { status: "UNKNOWN", failClosed: true, reason: "image-adapter-not-configured" };
  try {
    return await adapter.invoke({ ...request, prompt: request.prompt.trim() });
  } catch {
    return { status: "UNKNOWN", failClosed: true, reason: "image-adapter-failed" };
  }
}
