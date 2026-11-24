import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Point } from './gesture'

export interface Tracker {
  detect(video: HTMLVideoElement, timeMs: number): Point[][]
  close(): void
}

export async function createTracker(): Promise<Tracker> {
  const fileset = await FilesetResolver.forVisionTasks('/mediapipe')
  const make = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  let lm: HandLandmarker
  try {
    lm = await make('GPU')
  } catch {
    lm = await make('CPU')
  }
  return {
    detect: (video, timeMs) => lm.detectForVideo(video, timeMs).landmarks as Point[][],
    close: () => lm.close(),
  }
}
