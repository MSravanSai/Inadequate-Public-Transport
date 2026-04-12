import '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

let detectorPromise = null;

export async function getPeopleDetector() {
  if (!detectorPromise) {
    detectorPromise = cocoSsd.load({ base: 'mobilenet_v2' });
  }
  return detectorPromise;
}

export async function analyzePeopleCount(source, threshold = 0.20) {
  const detector = await getPeopleDetector();
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
}
