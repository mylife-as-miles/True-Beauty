/** Lifecycle contract with explicit model doubles; actual model proof is browser evidence. */
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  faceClose: vi.fn(),
  hairClose: vi.fn(),
  handClose: vi.fn(),
}));
vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: async () => ({}) },
  FaceLandmarker: {
    createFromOptions: async () => ({
      detect: () => ({
        faceLandmarks: [
          Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        ],
        faceBlendshapes: [
          { categories: [{ categoryName: "eyeBlinkLeft", score: 0.2 }] },
        ],
        facialTransformationMatrixes: [{ data: [1, 0, 0, 1] }],
      }),
      close: mocks.faceClose,
    }),
  },
  ImageSegmenter: {
    createFromOptions: async () => ({
      segment: (_source: unknown, callback: (result: unknown) => void) =>
        callback({
          confidenceMasks: [
            {
              width: 2,
              height: 1,
              getAsFloat32Array: () => new Float32Array([1, 0]),
            },
            {
              width: 2,
              height: 1,
              getAsFloat32Array: () => new Float32Array([0, 1]),
            },
          ],
        }),
      close: mocks.hairClose,
    }),
  },
  HandLandmarker: {
    createFromOptions: async () => ({
      detect: () => ({
        landmarks: [
          Array.from({ length: 21 }, (_, i) => ({
            x: 0.2 + i * 0.01,
            y: 0.4,
            z: 0,
          })),
        ],
        handedness: [[{ categoryName: "Left", score: 0.9 }]],
      }),
      close: mocks.handClose,
    }),
  },
  PoseLandmarker: {},
}));
import { VisionPipeline } from "./pipeline";
beforeEach(() => vi.clearAllMocks());
describe("returned observation lifetime across source reset and disposal", () => {
  it.each(["reset", "dispose"] as const)(
    "%s drops internal geometry without erasing the already returned face/hair/hand observation",
    async (operation) => {
      const pipeline = new VisionPipeline();
      const result = await pipeline.analyzeImage(
        { width: 100, height: 100 } as OffscreenCanvas,
        { face: true, hair: true, hands: true },
      );
      expect(result.landmarks).toHaveLength(478);
      expect(result.hands).toHaveLength(1);
      expect([...result.hairMask!.data]).toEqual([0, 1]);
      const original = structuredClone(result);
      if (operation === "reset") pipeline.resetTracking();
      else pipeline.dispose();
      expect(pipeline.getSnapshot()).not.toBe(result);
      expect(pipeline.getSnapshot()).toMatchObject({
        landmarks: [],
        hairMask: null,
        hands: [],
        bodyMask: null,
        pose: null,
        blendshapes: {},
        transform: null,
      });
      expect(result).toEqual(original);
      if (operation === "reset") pipeline.dispose();
      expect(mocks.faceClose).toHaveBeenCalledOnce();
      expect(mocks.hairClose).toHaveBeenCalledOnce();
      expect(mocks.handClose).toHaveBeenCalledOnce();
    },
  );
});
