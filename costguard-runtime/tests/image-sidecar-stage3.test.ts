import { expect, test } from "bun:test";
import { invokeImageSidecar, type ImageSidecarAdapter } from "../src/sidecars/images";

test("image sidecar fails closed without an explicitly injected adapter", async () => {
  await expect(invokeImageSidecar({ prompt: "fixture image" })).resolves.toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "image-adapter-not-configured",
  });
});

test("image sidecar validates the request and preserves credential-free fixture evidence", async () => {
  const observed: string[] = [];
  const adapter: ImageSidecarAdapter = {
    invoke: async (request) => {
      observed.push(request.prompt);
      return { status: "PRESENT", artifactId: "fixture-image", mimeType: "image/png" };
    },
  };
  await expect(invokeImageSidecar({ prompt: "fixture image", size: "1024x1024" }, adapter)).resolves.toEqual({
    status: "PRESENT",
    artifactId: "fixture-image",
    mimeType: "image/png",
  });
  expect(observed).toEqual(["fixture image"]);
  await expect(invokeImageSidecar({ prompt: "" }, adapter)).resolves.toEqual({
    status: "UNKNOWN",
    failClosed: true,
    reason: "image-prompt-invalid",
  });
});
