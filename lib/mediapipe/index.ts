import {
  FilesetResolver,
  ObjectDetector,
  FaceDetector,
  PoseLandmarker,
  ImageSegmenter,
} from '@mediapipe/tasks-vision';

/** Must match `package.json` `@mediapipe/tasks-vision` — `@latest` wasm can drift and break at runtime. */
const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';

const MODELS = {
  objectDetector:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite',
  faceDetector:
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
  poseLandmarker:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  imageSegmenter:
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
};

// ── Singleton instances ─────────────────────────────────────────────────────

let visionInstance: Awaited<
  ReturnType<typeof FilesetResolver.forVisionTasks>
> | null = null;
let objectDetectorInstance: ObjectDetector | null = null;
let faceDetectorInstance: FaceDetector | null = null;
let poseLandmarkerInstance: PoseLandmarker | null = null;
let imageSegmenterInstance: ImageSegmenter | null = null;

// ── Vision fileset ──────────────────────────────────────────────────────────

export async function getVision() {
  if (!visionInstance) {
    visionInstance = await FilesetResolver.forVisionTasks(WASM_CDN);
  }
  return visionInstance;
}

// ── Object Detector ─────────────────────────────────────────────────────────

export async function getObjectDetector(): Promise<ObjectDetector> {
  if (!objectDetectorInstance) {
    const vision = await getVision();
    try {
      objectDetectorInstance = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.objectDetector,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        maxResults: 10,
        scoreThreshold: 0.3,
      });
    } catch {
      // GPU unavailable — fall back to CPU
      objectDetectorInstance = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.objectDetector,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        maxResults: 10,
        scoreThreshold: 0.3,
      });
    }
  }
  return objectDetectorInstance;
}

// ── Face Detector ───────────────────────────────────────────────────────────

export async function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorInstance) {
    const vision = await getVision();
    try {
      faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.faceDetector,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
      });
    } catch {
      faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.faceDetector,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
      });
    }
  }
  return faceDetectorInstance;
}

// ── Pose Landmarker ─────────────────────────────────────────────────────────

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerInstance) {
    const vision = await getVision();
    try {
      poseLandmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.poseLandmarker,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 2,
      });
    } catch {
      poseLandmarkerInstance = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.poseLandmarker,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numPoses: 2,
      });
    }
  }
  return poseLandmarkerInstance;
}

// ── Image Segmenter ─────────────────────────────────────────────────────────

export async function getImageSegmenter(): Promise<ImageSegmenter> {
  if (!imageSegmenterInstance) {
    const vision = await getVision();
    try {
      imageSegmenterInstance = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.imageSegmenter,
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    } catch {
      imageSegmenterInstance = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODELS.imageSegmenter,
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
    }
  }
  return imageSegmenterInstance;
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

export function closeAll() {
  objectDetectorInstance?.close();
  faceDetectorInstance?.close();
  poseLandmarkerInstance?.close();
  imageSegmenterInstance?.close();
  objectDetectorInstance = null;
  faceDetectorInstance = null;
  poseLandmarkerInstance = null;
  imageSegmenterInstance = null;
  visionInstance = null;
}
