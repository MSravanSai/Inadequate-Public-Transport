const fs = require('fs');

const path = 'src/pages/LiveMonitor.jsx';
let lines = fs.readFileSync(path, 'utf8').split('\n');

// 1. Fix firebase import
const firebaseLineIdx = lines.findIndex(l => l.includes('services/firebase'));
if (firebaseLineIdx !== -1) {
    lines[firebaseLineIdx] = lines[firebaseLineIdx].replace('services/firebase', 'services/backend');
}

// 2. Add people-detector import
const importIdx = lines.findIndex(l => l.includes('import { format }'));
if (importIdx !== -1 && !lines.some(l => l.includes('analyzePeopleCount'))) {
    lines.splice(importIdx + 1, 0, "import { analyzePeopleCount } from '@/lib/people-detector';");
}

// 3. Replace CameraCard function
const startIdx = lines.findIndex(l => l.startsWith('function CameraCard({'));
let endIdx = -1;
for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].startsWith('export default function LiveMonitor')) {
        endIdx = i - 1; // The line before export default
        break;
    }
}

if (startIdx !== -1 && endIdx !== -1) {
    const newCameraCard = `function CameraCard({ route, location, isFestival, onReading, latestReading }) {
  const [liveCount, setLiveCount] = useState(null);
  const [liveDetections, setLiveDetections] = useState([]);
  const [liveStatus, setLiveStatus] = useState('idle');
  
  const videoRef = useRef(null);
  const liveLoopRef = useRef(null);
  const liveAnalysisInFlightRef = useRef(false);
  const { toast } = useToast();

  const label = LOCATION_LABELS[location] || location.replace('_', ' ');
  const cameraId = \`cam-\${route.id}-\${location}\`;

  const stopCameraStream = () => {
    if (liveLoopRef.current) {
      clearInterval(liveLoopRef.current);
      liveLoopRef.current = null;
    }
    liveAnalysisInFlightRef.current = false;

    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setLiveStatus('idle');
    setLiveCount(null);
    setLiveDetections([]);
  };

  const startLiveAnalysisLoop = () => {
    if (liveLoopRef.current) clearInterval(liveLoopRef.current);
    
    liveLoopRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || liveAnalysisInFlightRef.current) return;

      liveAnalysisInFlightRef.current = true;
      try {
        const { count, detections } = await analyzePeopleCount(video, 0.35);
        setLiveCount(count);
        setLiveDetections(detections || []);
        setLiveStatus('live');
      } catch (error) {
        console.error('Detection error:', error);
      } finally {
        liveAnalysisInFlightRef.current = false;
      }
    }, 300);
  };

  const startCamera = async () => {
    try {
      setLiveStatus('starting');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      startLiveAnalysisLoop();
    } catch (err) {
      toast({ title: 'Camera Error', description: 'Could not access camera', variant: 'destructive' });
      setLiveStatus('error');
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return stopCameraStream;
  }, []);

  const currentLevel = liveCount !== null ? getCrowdLevel(liveCount, isFestival, location) : 'low';

  return (
    <div className={\`bg-card rounded-2xl border shadow-sm overflow-hidden \${currentLevel === 'critical' ? 'border-red-300 ring-1 ring-red-200' : 'border-border'}\`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {liveStatus === 'starting' && <span className="text-xs text-accent"><RefreshCw className="w-3 h-3 animate-spin inline mr-1"/>Starting...</span>}
          {liveStatus === 'live' && <span className="text-xs text-green-600 font-medium"><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" /> Live YOLO</span>}
        </div>
      </div>

      <div className="relative bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
        <video 
          ref={videoRef} 
          playsInline 
          muted 
          className={\`w-full h-full object-cover \${liveStatus === 'idle' ? 'hidden' : 'block'}\`}
        />
        
        {liveStatus === 'idle' && (
          <div className="text-center">
            <Camera className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-xs">Camera inactive</p>
          </div>
        )}

        {liveDetections && liveDetections.length > 0 && videoRef.current && videoRef.current.videoWidth > 0 && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={\`0 0 \${videoRef.current.videoWidth} \${videoRef.current.videoHeight}\`} preserveAspectRatio="xMidYMid slice">
            {liveDetections.map((det, idx) => {
               if (det.label !== 'person') return null;
               return (
              <g key={idx}>
                <rect x={det.box.xmin} y={det.box.ymin} width={det.box.xmax - det.box.xmin} height={det.box.ymax - det.box.ymin} fill="none" stroke="#22c55e" strokeWidth="4" rx="4" />
                <text x={det.box.xmin} y={det.box.ymin > 20 ? det.box.ymin - 5 : det.box.ymin + 20} fill="#22c55e" fontSize="24" fontWeight="bold">Person {Math.round(det.score * 100)}%</text>
              </g>
            )})}
          </svg>
        )}

        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded font-medium">● LIVE</div>
        <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{cameraId}</div>
        
        {liveCount !== null && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-lg font-bold">{liveCount}</span>
            <span className="text-xs text-white/70">people</span>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2">
        {liveStatus === 'idle' ? (
          <Button onClick={startCamera} className="w-full" size="sm"><Camera className="w-3.5 h-3.5 mr-1.5" /> Start Live Surveillance</Button>
        ) : (
          <Button onClick={stopCameraStream} variant="outline" className="w-full text-xs" size="sm"><X className="w-3 h-3 mr-1.5" /> Stop Camera</Button>
        )}
      </div>
    </div>
  );
}`;

    lines.splice(startIdx, endIdx - startIdx, newCameraCard);
    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully updated the file!');
} else {
    console.log('Could not find CameraCard boundaries!');
}
