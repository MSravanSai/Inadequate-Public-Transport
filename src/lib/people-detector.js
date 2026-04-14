import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let detectorPromise = null;

export async function getPeopleDetector() {
  if (!detectorPromise) {
    try {
      await tf.ready();
      // Use the 'cpu' backend as a fallback if webgl fails, but don't force it unless needed
      // Force CPU if WebGL fails to load properly in some environments
      detectorPromise = cocoSsd.load({ base: 'mobilenet_v2' });
    } catch (err) {
      console.error('TFJS initialization failed:', err);
      detectorPromise = null;
      throw err;
    }
  }
  return detectorPromise;
}

export async function analyzePeopleCount(source, threshold = 0.20) {
  try {
    const detector = await getPeopleDetector();
    if (!detector) throw new Error('Detector not initialized');

    // Performance: ensure source is valid
    if (!source) throw new Error('No source provided for analysis');

    const predictions = await detector.detect(source, 150, 0.15);

    // Filter for people and apply threshold
    const people = predictions.filter(prediction =>
      prediction.class === 'person' && prediction.score >= threshold
    );

    // Map coco-ssd bbox [x, y, width, height] to transformers.js format { xmin, ymin, xmax, ymax }
    const formattedDetections = people.map(person => {
      const [x, y, width, height] = person.bbox;
      return {
        label: 'person',
        score: person.score,
        box: {
          xmin: x,
          ymin: y,
          xmax: x + width,
          ymax: y + height
        }
      };
    });

    return {
      count: formattedDetections.length,
      detections: formattedDetections,
      allDetections: predictions
    };
  } catch (error) {
    console.error('analyzePeopleCount error:', error);
    return {
      count: 0,
      detections: [],
      error: error.message
    };
  }
}
