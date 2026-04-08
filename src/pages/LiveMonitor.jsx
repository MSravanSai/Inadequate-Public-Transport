import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, RefreshCw, Upload, Bus, AlertTriangle, Zap, CheckCircle, Wifi, Smartphone, Globe, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CrowdBadge from '@/components/CrowdBadge';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { crowdReadingsService, busRequestsService, storageService } from '@/services/firebase';

const DEFAULT_ROUTES = [
  { id: 'r1', name: 'Madurai → Bangalore', color: 'bg-blue-500' },
  { id: 'r2', name: 'Madurai → Hyderabad', color: 'bg-purple-500' },
  { id: 'r3', name: 'Madurai → Chennai', color: 'bg-green-500' },
  { id: 'r4', name: 'Madurai → Coimbatore', color: 'bg-orange-500' },
];

// Location-specific thresholds
const LOCATION_THRESHOLDS = {
  bus_stand: { normal: 40, festival: 80 },
  inside_bus: { normal: 60, festival: 80 },
  front_inside_bus: { normal: 60, festival: 80 },
  back_inside_bus: { normal: 60, festival: 80 },
};

const getRoutes = () => {
  try {
    const saved = localStorage.getItem('routes');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load routes from localStorage:', e);
  }
  return DEFAULT_ROUTES;
};

const LOCATION_LABELS = {
  bus_stand: 'Bus Stand Camera',
  front_inside_bus: 'Front Inside Bus Camera',
  back_inside_bus: 'Back Inside Bus Camera',
};

function getCrowdLevel(count, isFestival, location = 'bus_stand') {
  const threshold = LOCATION_THRESHOLDS[location]?.[isFestival ? 'festival' : 'normal'] || 40;
  if (count < threshold * 0.4) return 'low';
  if (count < threshold * 0.7) return 'moderate';
  if (count < threshold) return 'high';
  return 'critical';
}

function CameraCard({ route, location, isFestival, onReading, latestReading }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [uploadMode, setUploadMode] = useState('file'); // 'file', 'online', 'mobile'
  const [streamUrl, setStreamUrl] = useState('');
  const [videoAnalysisProgress, setVideoAnalysisProgress] = useState(0);
  const [isVideoFile, setIsVideoFile] = useState(false);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const { toast } = useToast();

  const label = LOCATION_LABELS[location] || location.replace('_', ' ');
  const cameraId = `cam-${route.id}-${location}`;

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use back camera on mobile
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions.',
        variant: 'destructive',
      });
    }
  };

  const captureFromStream = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        setIsVideoFile(false); // Mobile captures are always images
        handleImageUpload({ target: { files: [file] } });
      }, 'image/jpeg');
    }
  };

  const analyzeVideoFrames = async (file, videoUrl) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.preload = 'metadata';

    return new Promise((resolve) => {
      video.onloadedmetadata = async () => {
        const duration = Math.floor(video.duration);
        const frameResults = [];
        let maxCount = 0;

        // Analyze every second
        for (let second = 0; second <= duration; second++) {
          setVideoAnalysisProgress(Math.round((second / duration) * 100));
          
          video.currentTime = second;
          
          await new Promise((resolveFrame) => {
            video.onseeked = () => {
              // Create canvas to capture frame
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              ctx.drawImage(video, 0, 0);
              
              // Mock AI analysis for this frame
              const mockCount = Math.floor(Math.random() * 100) + 10;
              const level = getCrowdLevel(mockCount, isFestival, location);
              
              frameResults.push({
                time: second,
                count: mockCount,
                level,
                timestamp: new Date().toISOString()
              });
              
              maxCount = Math.max(maxCount, mockCount);
              resolveFrame();
            };
          });

          // Small delay to prevent overwhelming the browser
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        setVideoAnalysisProgress(0); // Reset progress
        
        // Set result with time series data
        const level = getCrowdLevel(maxCount, isFestival, location);
        setResult({ 
          count: maxCount, 
          confidence: 'high', 
          notes: `Video analysis: Peak ${maxCount} people detected. Analyzed ${frameResults.length} frames.`,
          level, 
          snapshot_url: videoUrl,
          videoAnalysis: true,
          timeSeries: frameResults,
          duration
        });
        setAnalyzing(false);

        // Log reading with max count and trigger bus request
        await onReading(route.id, route.name, location, maxCount, isFestival, videoUrl);

        resolve();
      };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Detect if file is video
    const isVideo = file.type.startsWith('video/');
    setIsVideoFile(isVideo);

    // Show local preview
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setAnalyzing(true);
    setResult(null);

    if (isVideo) {
      // Handle video analysis - count every second
      await analyzeVideoFrames(file, localUrl);
    } else {
      // Handle image analysis (existing logic)
      // Mock AI analysis (simulate processing time)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Mock AI result
      const mockCount = Math.floor(Math.random() * 100) + 10;
      const mockAiResult = {
        people_count: mockCount,
        confidence: 'high',
        notes: `Mock analysis: ${mockCount} people detected at ${label}`
      };

      const count = mockAiResult.people_count || 0;
      const level = getCrowdLevel(count, isFestival, location);
      setResult({ count, confidence: mockAiResult.confidence, notes: mockAiResult.notes, level, snapshot_url: localUrl });
      setAnalyzing(false);

      // Log reading and trigger bus request
      await onReading(route.id, route.name, location, count, isFestival, localUrl);

      // Reset file input
      e.target.value = '';
    }
  };

  const handleOnlineStream = async () => {
    if (!streamUrl.trim()) {
      toast({
        title: 'URL Required',
        description: 'Please enter a valid stream URL.',
        variant: 'destructive',
      });
      return;
    }

    setAnalyzing(true);
    setResult(null);
    setPreviewUrl(streamUrl);

    // Mock AI analysis for online stream
    await new Promise(resolve => setTimeout(resolve, 3000));

    const mockCount = Math.floor(Math.random() * 100) + 10;
    const mockAiResult = {
      people_count: mockCount,
      confidence: 'medium',
      notes: `Live stream analysis: ${mockCount} people detected at ${label}`
    };

    const count = mockAiResult.people_count || 0;
    const level = getCrowdLevel(count, isFestival, location);
    setResult({ count, confidence: mockAiResult.confidence, notes: mockAiResult.notes, level, snapshot_url: streamUrl });
    setAnalyzing(false);

    await onReading(route.id, route.name, location, count, isFestival, streamUrl);
  };

  const currentCount = result?.count ?? latestReading?.people_count;
  const currentLevel = result?.level ?? latestReading?.crowd_level ?? 'low';

  const handleReset = () => {
    setResult(null);
    setPreviewUrl(null);
    setStreamUrl('');
    setIsVideoFile(false);
    setVideoAnalysisProgress(0);
    setAnalyzing(false);
  };

  return (
    <div className={`bg-card rounded-2xl border shadow-sm overflow-hidden ${currentLevel === 'critical' ? 'border-red-300 ring-1 ring-red-200' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {analyzing ? (
            <span className="flex items-center gap-1.5 text-xs text-accent font-medium">
              <RefreshCw className="w-3 h-3 animate-spin" /> 
              {isVideoFile ? 'Analyzing Video…' : 'Analyzing…'}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
            </span>
          )}
          <div className="absolute top-2 right-2" />
        </div>
      </div>

      {/* Camera view */}
      <div className="relative bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
        {uploadMode === 'mobile' && !previewUrl && (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="w-full h-full object-cover"
          />
        )}
        {previewUrl ? (
          uploadMode === 'online' ? (
            streamUrl.startsWith('http') ? (
              <img src={streamUrl} alt="Live Stream" className="w-full h-full object-cover" />
            ) : streamUrl.startsWith('rtsp') ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 gap-3">
                <AlertTriangle className="w-8 h-8 text-yellow-500" />
                <p className="text-white text-sm font-medium">RTSP Stream Detected</p>
                <p className="text-white/60 text-xs max-w-xs text-center">
                  RTSP streams require conversion. Try using HLS (m3u8) or HTTP stream URL instead, or set up an RTSP-to-HLS gateway.
                </p>
                <p className="text-white/40 text-xs mt-2">{streamUrl}</p>
              </div>
            ) : (
              <video 
                src={streamUrl} 
                autoPlay 
                muted 
                playsInline
                className="w-full h-full object-cover"
              />
            )
          ) : (
            isVideoFile ? (
              <video 
                src={previewUrl} 
                controls 
                className="w-full h-full object-cover"
                preload="metadata"
              />
            ) : (
              <img src={previewUrl} alt="Camera feed" className="w-full h-full object-cover" />
            )
          )
        ) : (
          <div className="text-center">
            <Camera className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 text-xs">No feed yet</p>
            <p className="text-slate-600 text-xs mt-0.5">Choose upload method below</p>
          </div>
        )}

        {/* Hidden canvas for mobile capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Overlay badges */}
        <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded font-medium">● LIVE</div>
        <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-0.5 rounded">{cameraId}</div>

        {/* Count overlay */}
        {currentCount !== undefined && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-lg font-bold">{currentCount}</span>
            <span className="text-xs text-white/70">people</span>
          </div>
        )}

        {analyzing && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
            <Zap className="w-8 h-8 text-accent animate-pulse" />
            <p className="text-white text-sm font-medium">
              {isVideoFile ? 'AI Analyzing Video Frames…' : 'AI Counting People…'}
            </p>
            <p className="text-white/60 text-xs">
              {isVideoFile ? `Processing every second of video ${videoAnalysisProgress}%` : 'Analyzing camera feed'}
            </p>
            {isVideoFile && (
              <div className="w-32 h-1 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-300" 
                  style={{ width: `${videoAnalysisProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload mode selector */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex gap-1">
          <button
            onClick={() => setUploadMode('file')}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
              uploadMode === 'file' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Upload className="w-3 h-3 inline mr-1" />
            File
          </button>
          <button
            onClick={() => setUploadMode('online')}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
              uploadMode === 'online' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Globe className="w-3 h-3 inline mr-1" />
            Online
          </button>
          <button
            onClick={() => setUploadMode('mobile')}
            className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
              uploadMode === 'mobile' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            <Smartphone className="w-3 h-3 inline mr-1" />
            Mobile
          </button>
          <button
            onClick={handleReset}
            className="px-2 py-1.5 rounded text-xs font-medium transition-all bg-destructive/10 text-destructive hover:bg-destructive/20"
            title="Reset all uploads"
          >
            <X className="w-3 h-3 inline mr-1" />
            Reset
          </button>
        </div>
      </div>

      {/* Upload controls */}
      <div className="px-4 py-3 space-y-2">
        {uploadMode === 'file' && (
          <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all ${
            analyzing
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}>
            <Upload className="w-3.5 h-3.5" />
            {analyzing ? (isVideoFile ? 'Analyzing Video Frames…' : 'Analyzing…') : 'Upload Photo/Video'}
            <input type="file" accept="image/*,video/*" className="hidden" onChange={handleImageUpload} disabled={analyzing} />
          </label>
        )}

        {uploadMode === 'online' && (
          <div className="space-y-2">
            <input
              type="url"
              placeholder="Enter stream URL (RTSP/HTTP)"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
            />
            <Button 
              onClick={handleOnlineStream} 
              disabled={analyzing || !streamUrl.trim()}
              className="w-full"
              size="sm"
            >
              <Wifi className="w-3.5 h-3.5 mr-1.5" />
              {analyzing ? 'Analyzing Stream…' : 'Analyze Live Stream'}
            </Button>
          </div>
        )}



        {uploadMode === 'mobile' && (
          <div className="space-y-2">
            <Button 
              onClick={startCamera} 
              disabled={analyzing}
              className="w-full"
              size="sm"
              variant="outline"
            >
              <Smartphone className="w-3.5 h-3.5 mr-1.5" />
              Start Mobile Camera
            </Button>
            {videoRef.current?.srcObject && (
              <Button 
                onClick={captureFromStream} 
                disabled={analyzing}
                className="w-full"
                size="sm"
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
                {analyzing ? 'Analyzing…' : 'Capture & Analyze'}
              </Button>
            )}
          </div>
        )}

        {previewUrl && (
          <Button
            onClick={handleReset}
            variant="outline"
            className="w-full text-xs"
            size="sm"
          >
            <X className="w-3 h-3 mr-1.5" />
            Reset Upload
          </Button>
        )}

        {/* Result / Status */}
        {result && (
          <div className={`rounded-xl p-3 text-xs space-y-2 ${currentLevel === 'critical' ? 'bg-red-50 border border-red-200' : 'bg-muted/50'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">AI Detection Result</span>
              <CrowdBadge level={result.level} />
            </div>
            <p className="text-muted-foreground">{result.notes}</p>
            <p className="text-muted-foreground">Confidence: <span className="font-medium capitalize">{result.confidence}</span></p>
            <Button
              onClick={handleReset}
              size="sm"
              variant="outline"
              className="w-full mt-2 text-xs"
            >
              <X className="w-3 h-3 mr-1.5" />
              Clear Reading
            </Button>
          </div>
        )}

        {result?.videoAnalysis && result?.timeSeries && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-medium mb-2">Video Analysis Timeline</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {result.timeSeries.map((frame, index) => (
                <div key={index} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{frame.time}s:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{frame.count} people</span>
                    <CrowdBadge level={frame.level} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Peak count:</span>
                <span className="font-bold text-primary">{result.count} people</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground">Duration:</span>
                <span>{result.duration}s</span>
              </div>
            </div>
          </div>
        )}

        {!result && latestReading && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Last scan: {format(new Date(latestReading.created_date), 'h:mm a')}</span>
            <CrowdBadge level={latestReading.crowd_level} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveMonitor() {
  const [selectedRoute, setSelectedRoute] = useState('r1');
  const [isFestival, setIsFestival] = useState(() => {
    const saved = localStorage.getItem('festivalMode');
    return saved ? JSON.parse(saved) : false;
  });
  const [showManualDeploy, setShowManualDeploy] = useState(false);
  const [manualBuses, setManualBuses] = useState('1');
  const [manualReason, setManualReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Clear old readings once on first app load to remove defaults
  useEffect(() => {
    const appVersion = localStorage.getItem('appVersion');
    if (appVersion !== '2.0') {
      localStorage.removeItem('crowdReadings');
      localStorage.removeItem('busRequests');
      localStorage.setItem('appVersion', '2.0');
    }
  }, []);

  const { data: readings = [], refetch } = useQuery({
    queryKey: ['crowd-readings'],
    queryFn: async () => {
      try {
        return await crowdReadingsService.getReadingsByRoute(selectedRoute);
      } catch (error) {
        console.error('Error fetching readings:', error);
        return [];
      }
    },
    refetchInterval: 15000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['extra-bus-requests'],
    queryFn: async () => {
      try {
        return await busRequestsService.getAllRequests();
      } catch (error) {
        console.error('Error fetching requests:', error);
        return [];
      }
    },
  });

  // Save readings to localStorage when they change
  useEffect(() => {
    if (readings && readings.length > 0) {
      localStorage.setItem('crowdReadings', JSON.stringify(readings));
    }
  }, [readings]);

  // Save requests to localStorage when they change
  useEffect(() => {
    if (requests && requests.length > 0) {
      localStorage.setItem('busRequests', JSON.stringify(requests));
    }
  }, [requests]);

  // Save festival mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('festivalMode', JSON.stringify(isFestival));
  }, [isFestival]);


  const createReading = useMutation({
    mutationFn: async (data) => {
      return await crowdReadingsService.addReading(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['crowd-readings'] }),
  });

  const createRequest = useMutation({
    mutationFn: async (data) => {
      return await busRequestsService.addRequest(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['extra-bus-requests'] }),
  });

  const handleManualDeploy = async () => {
    const buses = parseInt(manualBuses);
    if (!buses || buses < 1) {
      toast({
        title: 'Invalid Input',
        description: 'Please enter a valid number of buses (1 or more).',
        variant: 'destructive',
      });
      return;
    }

    const route = ROUTES.find(r => r.id === selectedRoute);
    
    if (!route) {
      toast({
        title: 'Route Not Found',
        description: 'Please select a valid route.',
        variant: 'destructive',
      });
      return;
    }

    await createRequest.mutateAsync({
      route_id: selectedRoute,
      route_name: route.name,
      location: 'bus_stand',
      buses_requested: buses,
      reason: manualReason || 'Manually deployed by operator',
      status: 'pending',
      is_festival_day: isFestival,
      requested_at: new Date().toISOString(),
    });

    toast({
      title: '🚌 Manual Bus Deployment Sent!',
      description: `${buses} bus(es) requested for ${route.name}. Awaiting admin approval.`,
    });

    setShowManualDeploy(false);
    setManualBuses('1');
    setManualReason('');
  };

  const handleReading = async (routeId, routeName, location, count, festival, snapshotUrl) => {
    const level = getCrowdLevel(count, festival, location);

    // Upload image to Firebase Storage if it's a local file
    let finalSnapshotUrl = snapshotUrl;
    if (snapshotUrl && snapshotUrl.startsWith('blob:')) {
      try {
        const response = await fetch(snapshotUrl);
        const blob = await response.blob();
        const fileName = `crowd-readings/${routeId}/${location}/${Date.now()}.jpg`;
        finalSnapshotUrl = await storageService.uploadImage(blob, fileName);
      } catch (error) {
        console.error('Error uploading image:', error);
        toast({
          title: 'Upload Error',
          description: 'Failed to upload image to cloud storage.',
          variant: 'destructive',
        });
      }
    }

    // Map location for storage
    const locationMap = {
      'front_inside_bus': 'inside_bus',
      'back_inside_bus': 'inside_bus'
    };
    const storageLocation = locationMap[location] || location;

    await createReading.mutateAsync({
      route_id: routeId,
      route_name: routeName,
      location: storageLocation,
      camera_id: `cam-${routeId}-${location}`,
      people_count: count,
      crowd_level: level,
      is_festival_day: festival,
      snapshot_url: finalSnapshotUrl,
      created_date: new Date().toISOString(),
    });

    // Auto-trigger extra bus request based on location-specific thresholds
    const locationThreshold = LOCATION_THRESHOLDS[location]?.[festival ? 'festival' : 'normal'] || 40;

    if (count >= locationThreshold) {
      const alreadyPending = requests.some(r => r.route_id === routeId && r.status === 'pending');
      if (!alreadyPending) {
        const extra = Math.ceil((count - locationThreshold) / 40) + 1;
        await createRequest.mutateAsync({
          route_id: routeId,
          route_name: routeName,
          people_count: count,
          location,
          buses_requested: extra,
          reason: `Camera detected ${count} people at ${LOCATION_LABELS[location] || location} — exceeds location threshold of ${locationThreshold}`,
          is_festival_day: festival,
          requested_at: new Date().toISOString(),
        });
        toast({
          title: '🚌 Auto Bus Deployed!',
          description: `${extra} bus(es) auto-deployed for ${routeName} at ${LOCATION_LABELS[location] || location}. Awaiting admin approval.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Reading Logged', description: `${count} people — ${level.toUpperCase()} crowd. Request already pending.` });
      }
    } else {
      const locationLabel = LOCATION_LABELS[location] || location.replace('_', ' ');
      toast({ title: 'Camera Reading Logged', description: `${count} people at ${locationLabel} — ${level} crowd level.` });
    }
  };

  const ROUTES = getRoutes();
  const route = ROUTES.find(r => r.id === selectedRoute);
  const routeReadings = readings.filter(r => r.route_id === selectedRoute).slice(0, 8);
  const getLatest = (routeId, loc) => readings.filter(r => r.route_id === routeId && r.location === loc)[0];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Camera Monitor</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Upload camera snapshots — AI counts people & auto-requests extra buses</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <div
              onClick={() => setIsFestival(!isFestival)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isFestival ? 'bg-orange-400' : 'bg-muted-foreground/30'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isFestival ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className={isFestival ? 'text-orange-600 font-medium' : 'text-muted-foreground'}>Festival Mode</span>
          </label>
          <Button 
            onClick={() => setShowManualDeploy(true)}
            size="sm"
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Deploy Buses
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 flex items-start gap-3">
        <Zap className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-foreground">AI-Powered Camera Analysis with Location-Based Alerts</p>
          <p className="text-muted-foreground text-xs mt-0.5">
            Auto-deploys buses based on location thresholds:<br/>
            • <strong>Bus Stand:</strong> {isFestival ? '80' : '40'} people threshold<br/>
            • <strong>Inside Bus:</strong> {isFestival ? '80' : '60'} people threshold
          </p>
        </div>
      </div>

      {isFestival && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <p className="text-sm text-orange-700">Festival mode active — Alert thresholds: Bus Stand fires at <strong>80 people</strong>, Inside Bus at <strong>80 people</strong>.</p>
        </div>
      )}

      {/* Manual Bus Deployment Dialog */}
      <Dialog open={showManualDeploy} onOpenChange={setShowManualDeploy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy Buses Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Route</label>
              <div className="mt-1 p-3 bg-muted rounded-lg text-sm">
                {ROUTES.find(r => r.id === selectedRoute)?.name}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Number of Buses</label>
              <Input
                type="number"
                min="1"
                value={manualBuses}
                onChange={(e) => setManualBuses(e.target.value)}
                className="mt-1"
                placeholder="Enter number of buses"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Reason (Optional)</label>
              <Textarea
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                className="mt-1 text-xs"
                placeholder="Why are these buses being deployed?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManualDeploy(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleManualDeploy}
              className="bg-green-600 hover:bg-green-700"
            >
              <Bus className="w-3.5 h-3.5 mr-1.5" />
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Route tabs */}
      <div className="flex gap-2 flex-wrap">
        {ROUTES && ROUTES.length > 0 ? (
          ROUTES.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedRoute(r.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                selectedRoute === r.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${r.color}`} />
              {r.name}
            </button>
          ))
        ) : (
          <div className="w-full text-center py-4 text-muted-foreground">
            <p className="text-sm">No routes configured yet.</p>
          </div>
        )}
      </div>

      {/* Camera feeds for selected route */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          {route?.name || 'Select a route'} — Camera Feeds
        </h2>
        {route ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CameraCard
            route={route}
            location="bus_stand"
            isFestival={isFestival}
            onReading={handleReading}
            latestReading={getLatest(route.id, 'bus_stand')}
          />
          <CameraCard
            route={route}
            location="front_inside_bus"
            isFestival={isFestival}
            onReading={handleReading}
            latestReading={getLatest(route.id, 'front_inside_bus')}
          />
          <CameraCard
            route={route}
            location="back_inside_bus"
            isFestival={isFestival}
            onReading={handleReading}
            latestReading={getLatest(route.id, 'back_inside_bus')}
          />
        </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">No routes available. Please configure routes first.</p>
          </div>
        )}
      </div>

      {/* Recent readings table */}
      <div>
        <h2 className="text-base font-semibold mb-3">Recent Readings — {route?.name || 'No Route Selected'}</h2>
        {routeReadings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground bg-card rounded-2xl border border-border">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No camera readings yet. Upload a snapshot above.</p>
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">People</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Level</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Bus Request</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {routeReadings.map(r => {
                  const threshold = LOCATION_THRESHOLDS[r.location]?.[r.is_festival_day ? 'festival' : 'normal'] || 40;
                  const triggered = r.people_count >= threshold;
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 capitalize text-xs">{LOCATION_LABELS[r.location] || r.location?.replace('_', ' ')}</td>
                      <td className="px-4 py-3 font-bold">{r.people_count}</td>
                      <td className="px-4 py-3"><CrowdBadge level={r.crowd_level} /></td>
                      <td className="px-4 py-3">
                        {triggered ? (
                          <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                            <Bus className="w-3 h-3" /> Requested
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle className="w-3 h-3" /> Within limit
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(r.created_date), 'h:mm a')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}