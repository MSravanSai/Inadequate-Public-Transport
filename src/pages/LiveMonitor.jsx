import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, RefreshCw, Bus, AlertTriangle, Zap, CheckCircle, X, Plus, Upload, Link as LinkIcon, Image as ImageIcon, Clock, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import CrowdBadge from '@/components/CrowdBadge';
import { format } from 'date-fns';
import { analyzePeopleCount } from '@/lib/people-detector';
import { useToast } from '@/components/ui/use-toast';
import { crowdReadingsService, busRequestsService, storageService, routesService } from '@/services/backend';

const LIVE_MONITOR_SESSION_PREFIX = 'smartbus_live_monitor_session';

// Location-specific thresholds
const LOCATION_THRESHOLDS = {
  bus_stand: { normal: 40, festival: 80 },
  front_inside_bus: { normal: 60, festival: 80 },
  back_inside_bus: { normal: 60, festival: 80 },
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
  const sessionKey = `${LIVE_MONITOR_SESSION_PREFIX}:${route.id}:${location}`;
  const persistedSession = (() => {
    try {
      const raw = localStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const [liveCount, setLiveCount] = useState(() => persistedSession?.liveCount ?? latestReading?.people_count ?? null);
  const [liveDetections, setLiveDetections] = useState(() => persistedSession?.liveDetections ?? []);
  const [sourceDim, setSourceDim] = useState(() => persistedSession?.sourceDim ?? { width: 0, height: 0 });
  const [liveStatus, setLiveStatus] = useState(() => persistedSession?.liveStatus ?? 'idle'); // 'idle', 'starting', 'live', 'analyzing', 'analyzed', 'error'
  const [imageUrl, setImageUrl] = useState(() => persistedSession?.imageUrl ?? null);
  const [uploadType, setUploadType] = useState(() => persistedSession?.uploadType ?? 'image'); // 'image' or 'video'
  const [activeTab, setActiveTab] = useState(() => persistedSession?.activeTab ?? 'camera');
  const [urlInput, setUrlInput] = useState(() => persistedSession?.urlInput ?? '');
  const [isYoutube, setIsYoutube] = useState(false);
  const [restoreTracking, setRestoreTracking] = useState(() => Boolean(persistedSession?.isTracking));

  const checkYoutube = (url) => {
    return url.includes('youtube.com/') || url.includes('youtu.be/');
  };

  useEffect(() => {
    setIsYoutube(checkYoutube(urlInput));
  }, [urlInput]);

  const videoRef = useRef(null);
  const uploadVideoRef = useRef(null);
  
  const liveLoopRef = useRef(null);
  const liveAnalysisInFlightRef = useRef(false);
  const { toast } = useToast();

  const label = LOCATION_LABELS[location] || location.replace('_', ' ');
  const cameraId = `cam-${route.id}-${location}`;

  useEffect(() => {
    try {
      localStorage.setItem(
        sessionKey,
        JSON.stringify({
          activeTab,
          uploadType,
          imageUrl,
          urlInput,
          liveCount,
          liveDetections,
          sourceDim,
          liveStatus,
          isTracking: activeTab === 'upload' && uploadType === 'video' && liveStatus === 'live',
        })
      );
    } catch (error) {
      console.error('Failed to persist live monitor session:', error);
    }
  }, [sessionKey, activeTab, uploadType, imageUrl, urlInput, liveCount, liveDetections, sourceDim, liveStatus]);

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
    if (activeTab === 'camera' || uploadType === 'video') {
      setLiveStatus('idle');
      if (activeTab === 'camera') {
        setLiveCount(null);
      }
      setLiveDetections([]);
      const routeName = route.source ? `${route.source} → ${route.destination}` : route.name;
      onReading(route.id, routeName, location, 0, isFestival, null, true, true);
    }
    if (uploadType === 'video') {
      setRestoreTracking(false);
      if (uploadVideoRef.current) {
        uploadVideoRef.current.pause();
      }
    }
  };

  const handleReset = () => {
    stopCameraStream();
    setImageUrl(null);
    setLiveDetections([]);
    setLiveCount(null);
    setUrlInput('');
    setLiveStatus('idle');
    const routeName = route.source ? `${route.source} → ${route.destination}` : route.name;
    onReading(route.id, routeName, location, 0, isFestival, null, true, true);
  };

  const startAnalysisLoop = (targetVideoRef) => {
    if (liveLoopRef.current) clearInterval(liveLoopRef.current);
    
    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    let tickCount = 0;

    liveLoopRef.current = setInterval(async () => {
      const video = targetVideoRef.current;
      if (!video || video.readyState < 2 || liveAnalysisInFlightRef.current) return;

      liveAnalysisInFlightRef.current = true;
      try {
        offscreenCanvas.width = video.videoWidth;
        offscreenCanvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

        const result = await analyzePeopleCount(offscreenCanvas, 0.25);
        setLiveCount(result.count);
        setLiveDetections(result.detections);
        setSourceDim({ width: video.videoWidth, height: video.videoHeight });
        setLiveStatus('live');
        
        // Push background reads to Dashboard every 5 seconds silently without spamming Toasts
         if (tickCount % 10 === 0) {
            const routeName = route.source ? `${route.source} → ${route.destination}` : route.name;
            onReading(route.id, routeName, location, result.count, isFestival, null, true, false); // silent=true, skipVerif=false for live
         }
        tickCount++;
      } catch (error) {
        console.error('Detection error:', error);
      } finally {
        liveAnalysisInFlightRef.current = false;
      }
    }, 500);
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
      startAnalysisLoop(videoRef);
    } catch (err) {
      console.error('Camera Error:', err);
      toast({ title: 'Camera Error', description: 'Could not access camera', variant: 'destructive' });
      setLiveStatus('error');
    }
  };
  
  const startUploadedVideo = () => {
    if (uploadVideoRef.current) {
      uploadVideoRef.current.play();
      setLiveStatus('starting');
      setRestoreTracking(false);
      startAnalysisLoop(uploadVideoRef);
    }
  };

  const analyzeStaticImage = async (url) => {
    setLiveStatus('analyzing');
    setImageUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const result = await analyzePeopleCount(img, 0.35);
        setLiveCount(result.count);
        setLiveDetections(result.detections);
        setSourceDim({ width: img.naturalWidth, height: img.naturalHeight });
        setLiveStatus('analyzed');
        const routeName = route.source ? `${route.source} → ${route.destination}` : route.name;
        onReading(route.id, routeName, location, result.count, isFestival, url, false, true); // silent=false, skipVerif=true for static image
      } catch (e) {
        console.error(e);
        toast({ title: 'Analysis Error', description: 'Failed to extract counts', variant: 'destructive' });
        setLiveStatus('error');
      }
    };
    img.onerror = () => {
      if (checkYoutube(url)) {
        setLiveStatus('live'); // Treat as live embed
        setImageUrl(url);
      } else {
        toast({ title: 'Image Load Error', description: 'Could not load image. Check URL or CORS permissions.', variant: 'destructive' });
        setLiveStatus('error');
      }
    };
    img.src = url;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    stopCameraStream(); // stop any active processes before loading new file
    
    const isVideo = file.type.startsWith('video/');
    const uploadFn = isVideo ? storageService.uploadVideo : storageService.uploadImage;
    const objectUrl = await uploadFn(file);
    
    setUploadType(isVideo ? 'video' : 'image');
    setImageUrl(objectUrl);
    setLiveStatus('idle');
    setLiveCount(null);
    setRestoreTracking(false);
    
    if (!isVideo) {
      analyzeStaticImage(objectUrl);
    }
  };

  useEffect(() => {
    if (activeTab !== 'camera' && activeTab !== 'upload') {
      stopCameraStream();
    } else if (activeTab === 'upload' && uploadType === 'image') {
       stopCameraStream();
    }
  }, [activeTab, uploadType]);

  useEffect(() => {
    if (
      restoreTracking &&
      activeTab === 'upload' &&
      uploadType === 'video' &&
      imageUrl &&
      uploadVideoRef.current
    ) {
      const video = uploadVideoRef.current;
      const tryResume = async () => {
        try {
          await video.play();
          setLiveStatus('starting');
          startAnalysisLoop(uploadVideoRef);
          setLiveStatus('live');
          setRestoreTracking(false);
        } catch (error) {
          console.error('Failed to resume video tracking:', error);
        }
      };

      if (video.readyState >= 2) {
        tryResume();
      } else {
        const onLoaded = () => {
          tryResume();
          video.removeEventListener('loadeddata', onLoaded);
        };
        video.addEventListener('loadeddata', onLoaded);
        return () => video.removeEventListener('loadeddata', onLoaded);
      }
    }
  }, [restoreTracking, activeTab, uploadType, imageUrl]);

  const currentLevel = liveCount !== null ? getCrowdLevel(liveCount, isFestival, location) : 'low';

  const renderBoundingBoxes = (isObjectCover) => {
    if (liveStatus === 'idle' || !liveDetections || liveDetections.length === 0 || !sourceDim.width) return null;
    return (
      <svg 
        viewBox={`0 0 ${sourceDim.width} ${sourceDim.height}`}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        preserveAspectRatio={isObjectCover ? "xMidYMid slice" : "xMidYMid meet"}
      >
        {liveDetections.map((det, i) => (
          <g key={i}>
            <rect 
              x={det.box.xmin} 
              y={det.box.ymin} 
              width={det.box.xmax - det.box.xmin} 
              height={det.box.ymax - det.box.ymin} 
              fill="none" 
              stroke="#22c55e" 
              strokeWidth={Math.max(2, sourceDim.width * 0.005)} 
              rx={Math.max(2, sourceDim.width * 0.005)}
            />
            <text 
              x={det.box.xmin} 
              y={Math.max(0, det.box.ymin - 5)} 
              fill="#22c55e" 
              fontSize={Math.max(14, sourceDim.width * 0.025)}
              fontWeight="bold"
            >
              {Math.round(det.score * 100)}%
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div className={`bg-card rounded-2xl border shadow-sm flex flex-col overflow-hidden ${currentLevel === 'critical' ? 'border-red-300 ring-1 ring-red-200' : 'border-border'}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={handleReset}
            className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-accent group"
            title="Reset Camera"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {(liveStatus === 'starting' || liveStatus === 'analyzing') && <span className="text-xs text-accent"><RefreshCw className="w-3 h-3 animate-spin inline mr-1"/>Processing...</span>}
          {liveStatus === 'live' && <span className="text-xs text-red-500 font-medium tracking-wide flex items-center"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse mr-1.5" /> LIVE</span>}
          {liveStatus === 'analyzed' && <span className="text-xs text-green-600 font-medium"><CheckCircle className="w-3 h-3 inline mr-1" /> Logged</span>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3 rounded-none border-b h-auto select-none p-0 bg-transparent">
            <TabsTrigger value="camera" className="text-xs py-2.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:bg-accent/5"><Camera className="w-3 h-3 mr-1.5"/>Mobile</TabsTrigger>
            <TabsTrigger value="upload" className="text-xs py-2.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:bg-accent/5"><Upload className="w-3 h-3 mr-1.5"/>File</TabsTrigger>
            <TabsTrigger value="url" className="text-xs py-2.5 rounded-none data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:bg-accent/5"><LinkIcon className="w-3 h-3 mr-1.5"/>Link</TabsTrigger>
          </TabsList>
          
          {/* Mobile Tab */}
          <TabsContent value="camera" className="m-0 border-none p-0 flex-col flex flex-1 focus-visible:outline-none">
            <div className="relative bg-slate-900 aspect-video flex items-center justify-center overflow-hidden">
              <video 
                ref={videoRef} 
                playsInline 
                muted 
                className={`w-full h-full object-cover ${liveStatus === 'idle' ? 'hidden' : 'block'}`}
              />
              {renderBoundingBoxes(true)}
              
              {liveStatus === 'idle' && (
                <div className="text-center">
                  <Camera className="w-10 h-10 text-slate-800/10 mx-auto" />
                </div>
              )}


              
              {liveCount !== null && (
                <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-lg backdrop-blur-sm">
                  <span className="text-lg font-bold">{liveCount}</span>
                  <span className="text-xs text-white/70">people</span>
                </div>
              )}
            </div>
            <div className="px-4 py-3 space-y-2 bg-card">
              {liveStatus === 'idle' ? (
                <Button onClick={startCamera} className="w-full shadow-sm" size="sm"><Camera className="w-3.5 h-3.5 mr-1.5" /> Start Surveillance</Button>
              ) : (
                <Button onClick={stopCameraStream} variant="outline" className="w-full text-xs" size="sm"><X className="w-3 h-3 mr-1.5" /> Stop Camera</Button>
              )}
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="m-0 border-none p-0 flex-col flex flex-1 focus-visible:outline-none">
            <div className="relative bg-slate-900/90 aspect-video flex items-center justify-center overflow-hidden border-b border-border/50">
               {imageUrl ? (
                 uploadType === 'video' ? (
                   <video ref={uploadVideoRef} src={imageUrl} muted autoPlay={false} playsInline loop controls className="w-full h-full object-contain bg-black" />
                 ) : (
                   <img src={imageUrl} alt="Uploaded" className="w-full h-full object-cover" />
                 )
               ) : (
                 <div className="text-center text-slate-500">
                   <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                   <span className="text-xs"></span>
                 </div>
               )}
               {renderBoundingBoxes(uploadType !== 'video')}
               {imageUrl && liveCount !== null && (
                 <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-lg backdrop-blur-sm pointer-events-none">
                    <span className="text-lg font-bold">{liveCount}</span>
                    <span className="text-xs text-white/70">people</span>
                 </div>
               )}
            </div>
            <div className="px-4 py-3 bg-card space-y-2">
               <div className="flex gap-2">
                 <Button onClick={() => document.getElementById('file-upload-' + cameraId).click()} className="flex-1" size="sm" variant="secondary" disabled={liveStatus === 'analyzing'}>
                   <Upload className="w-3.5 h-3.5 mr-1.5" /> 
                   {liveStatus === 'analyzing' ? 'Analyzing...' : 'Choose File'}
                 </Button>
                 {uploadType === 'video' && imageUrl && (
                    <Button onClick={liveStatus === 'live' ? stopCameraStream : startUploadedVideo} variant={liveStatus === 'live' ? "outline" : "default"} size="sm" className="flex-1">
                      {liveStatus === 'live' ? <X className="w-3 h-3 mr-1.5" /> : <Camera className="w-3 h-3 mr-1.5" />}
                      {liveStatus === 'live' ? 'Stop Tracking' : 'Track Video'}
                    </Button>
                 )}
               </div>
               <input id={'file-upload-' + cameraId} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
            </div>
          </TabsContent>

          {/* Link Tab */}
          <TabsContent value="url" className="m-0 border-none p-0 flex-col flex flex-1 focus-visible:outline-none">
            <div className="relative bg-slate-900/90 aspect-video flex items-center justify-center overflow-hidden border-b border-border/50">
               {imageUrl ? (
                 isYoutube ? (
                   <iframe
                     src={imageUrl.replace('watch?v=', 'embed/').replace('live/', 'embed/')}
                     className="w-full h-full border-none"
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                     allowFullScreen
                   />
                 ) : (
                   <img src={imageUrl} alt="Linked url" className="w-full h-full object-cover" />
                 )
               ) : (
                 <div className="text-center text-slate-500">
                   <LinkIcon className="w-8 h-8 mx-auto mb-2 opacity-50"/>
                   <span className="text-xs"></span>
                 </div>
               )}
               {!isYoutube && renderBoundingBoxes(true)}
               {imageUrl && liveCount !== null && !isYoutube && (
                 <div className="absolute bottom-2 left-2 bg-black/70 text-white rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-lg backdrop-blur-sm">
                    <span className="text-lg font-bold">{liveCount}</span>
                    <span className="text-xs text-white/70">people</span>
                 </div>
               )}
               {isYoutube && (
                 <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                   Live Embed - AI Analysis Limited
                 </div>
               )}
            </div>
            <div className="px-4 py-3 flex gap-2 bg-card">
               <Input 
                 value={urlInput} 
                 onChange={e => setUrlInput(e.target.value)} 
                 placeholder="https://..." 
                 className="flex-1 text-xs h-8" 
                 onKeyDown={e => e.key === 'Enter' && urlInput && analyzeStaticImage(urlInput)}
               />
               <Button 
                 onClick={() => urlInput && analyzeStaticImage(urlInput)} 
                 size="sm" 
                 variant="secondary"
                 className="h-8 shrink-0" 
                 disabled={!urlInput || liveStatus === 'analyzing'}
               >
                 {liveStatus === 'analyzing' ? 'Analyzing...' : 'Load'}
               </Button>
            </div>
          </TabsContent>
      </Tabs>
    </div>
  );
}

export default function LiveMonitor() {
  const { data: ROUTES_RAW = [], refetch: refetchRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: async () => await routesService.getRoutes(),
    refetchInterval: 5000,
  });

  const ROUTES = ROUTES_RAW.filter((route, index, list) => {
    const key = `${route.source || route.name}|${route.destination}`;
    return index === list.findIndex(item => `${item.source || item.name}|${item.destination}` === key);
  });

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [liveClock, setLiveClock] = useState(format(new Date(), 'h:mm:ss a'));
  const inFlightRequestsRef = useRef(new Set());
  const lastRequestTimeRef = useRef({}); // { routeId: timestamp } 15s cooldown
  const highCrowdTimersRef = useRef({}); // { 'routeId-location': timestamp } 20s sustained requirement

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(format(new Date(), 'h:mm:ss a'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  useEffect(() => {
    if (ROUTES.length > 0 && (!selectedRoute || !ROUTES.find(r => r.id === selectedRoute))) {
      setSelectedRoute(ROUTES[0].id);
    }
  }, [ROUTES, selectedRoute]);

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
    const v = localStorage.getItem('appVersionV3');
    if (v !== 'true') {
      localStorage.removeItem('smartbus_crowdReadings');
      localStorage.removeItem('smartbus_busRequests');
      localStorage.removeItem('smartbus_live_monitor_session');
      localStorage.setItem('appVersionV3', 'true');
    }
  }, []);

  const { data: readings = [], refetch } = useQuery({
    queryKey: ['crowd-readings'],
    queryFn: async () => {
      if (!selectedRoute) return [];
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
      route_name: route.source ? `${route.source} → ${route.destination}` : route.name,
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

  const handleReading = async (routeId, routeName, location, count, festival, snapshotUrl, silent = false, skipVerification = false) => {
    const level = getCrowdLevel(count, festival, location);

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
      snapshot_url: snapshotUrl,
      created_date: new Date().toISOString(),
    });

    const route = ROUTES.find(r => r.id === routeId);
    let locationThreshold = LOCATION_THRESHOLDS[location]?.[festival ? 'festival' : 'normal'] || 40;
    
    // Override with route-specific thresholds if available
    if (route) {
       const isStand = location === 'bus_stand';
       const routeThreshold = festival 
         ? (isStand ? route.stand_festival_threshold : route.bus_festival_threshold)
         : (isStand ? route.stand_threshold : route.bus_threshold);
       
       // Fallback to old generic thresholds if specialized ones are missing
       const fallback = festival ? route.festival_threshold : route.normal_threshold;
       
       if (routeThreshold || fallback) {
         locationThreshold = Number(routeThreshold || fallback);
       }
    }

    if (count >= locationThreshold) {
      // Only auto-deploy buses based on the bus stand camera count
      if (location !== 'bus_stand') {
        const locationLabel = LOCATION_LABELS[location] || location.replace('_', ' ');
        if (!silent) toast({ title: 'High Crowd Logged', description: `${count} people at ${locationLabel} (Threshold: ${locationThreshold}) — Auto-deploy restricted to bus stand.` });
        return;
      }

      // 20s Sustained Detection Logic
      const timerKey = `${routeId}-${location}`;
      if (!highCrowdTimersRef.current[timerKey]) {
        highCrowdTimersRef.current[timerKey] = Date.now();
      }
      
      const sustainedDuration = (Date.now() - highCrowdTimersRef.current[timerKey]) / 1000;
      
      if (!skipVerification && sustainedDuration < 20) {
         if (!silent) toast({ 
           title: '⏳ Verifying Crowd Density...', 
           description: `Maintaining threshold for ${Math.round(sustainedDuration)}s. Request auto-sends at 20s.` 
         });
         return; // Do not send request yet
      }

      // Check live pending status directly from the local DB avoiding React state race conditions
      const currentRequests = await busRequestsService.getAllRequests();
      const alreadyPendingRemote = currentRequests.some(r => r.route_id === routeId && r.status === 'pending');
      const alreadyPendingLocal = inFlightRequestsRef.current.has(routeId);
      
      const now = Date.now();
      const lastSent = lastRequestTimeRef.current[routeId] || 0;
      const isCoolingDown = (now - lastSent) < 15000; // 15 second cooldown

      if (!alreadyPendingRemote && !alreadyPendingLocal && !isCoolingDown) {
        // Lock this route immediately globally for this session
        inFlightRequestsRef.current.add(routeId);
        lastRequestTimeRef.current[routeId] = now;
        
        const extra = 1 + Math.floor((count - locationThreshold) / 40); 
        await createRequest.mutateAsync({
          route_id: routeId,
          route_name: routeName,
          people_count: count,
          location,
          buses_requested: extra,
          reason: `Camera detected ${count} people — exceeds ${festival ? 'Festival' : 'Normal'} threshold of ${locationThreshold}`,
          is_festival_day: festival,
          requested_at: new Date().toISOString(),
        });

        // Require another full 20s interval hold before attempting another dispatch
        delete highCrowdTimersRef.current[timerKey];

        // Small delay to ensure the remote query has time to reflect the new request
        setTimeout(() => {
          inFlightRequestsRef.current.delete(routeId);
        }, 5000);

        toast({
          title: '🚌 Auto Bus Deployed!',
          description: `${extra} bus(es) auto-deployed for ${routeName}. Awaiting admin approval.`,
          variant: 'destructive',
        });
      } else {
        // Reset the timer so it doesn't endlessly spam while suppressed, requiring 20s to check again
        delete highCrowdTimersRef.current[timerKey];
        if (!silent) toast({ 
          title: 'Deployment Suppressed', 
          description: `Crowd (${count}) is above threshold, but a request for ${routeName} is already pending approval or cooling down.` 
        });
      }
    } else {
      // Reset timer if count drops below threshold
      const timerKey = `${routeId}-${location}`;
      delete highCrowdTimersRef.current[timerKey];

      const locationLabel = LOCATION_LABELS[location] || location.replace('_', ' ');
      if (!silent) toast({ title: 'Reading Logged', description: `${count} people at ${locationLabel} — status OK (Threshold: ${locationThreshold}).` });
    }
  };

  const route = ROUTES.find(r => r.id === selectedRoute);
  const routeReadings = readings.filter(r => r.route_id === selectedRoute).slice(0, 8);
  const getLatest = (routeId, loc) => readings.filter(r => r.route_id === routeId && r.location === loc)[0];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Live Camera Monitor</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums font-medium">{liveClock}</span>
            <span className="opacity-40 select-none mx-1">|</span>
            <span>Live tracking with location-based alerts</span>
          </div>
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
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchRoutes(); }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Deployment Thresholds Info */}
      <div className="bg-accent/10 border border-accent/20 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
        <Zap className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
        <div className="text-sm flex-1">
          <p className="font-bold text-accent mb-1 tracking-tight flex items-center gap-2">
            Adaptive Logic Active — {ROUTES.find(r => r.id === selectedRoute)?.source} Feed
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div className="bg-background/50 rounded-xl p-3 border border-accent/10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Bus Stand Trigger</p>
              <p className="font-bold text-foreground">
                {isFestival 
                  ? (ROUTES.find(r => r.id === selectedRoute)?.stand_festival_threshold || '80') 
                  : (ROUTES.find(r => r.id === selectedRoute)?.stand_threshold || '40')} people
              </p>
            </div>
            <div className="bg-background/50 rounded-xl p-3 border border-accent/10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Inside Bus Trigger</p>
              <p className="font-bold text-foreground">
                {isFestival 
                  ? (ROUTES.find(r => r.id === selectedRoute)?.bus_festival_threshold || '80') 
                  : (ROUTES.find(r => r.id === selectedRoute)?.bus_threshold || '60')} people
              </p>
            </div>
          </div>
        </div>
      </div>

      {isFestival && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
          <p className="text-sm text-orange-700">
            Festival mode active — Using festival threshold of <strong>{ROUTES.find(r => r.id === selectedRoute)?.festival_threshold || '80'} people</strong> for this route.
          </p>
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
                {(() => {
                  const r = ROUTES.find(r => r.id === selectedRoute);
                  return r ? (r.source ? `${r.source} → ${r.destination}` : r.name) : 'Unknown Route';
                })()}
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
              <span className={`w-2 h-2 rounded-full ${r.color || 'bg-primary'}`} />
              {r.source ? `${r.source} → ${r.destination}` : r.name}
            </button>
          ))
        ) : (
          <div className="w-full text-center py-4 text-muted-foreground">
            <p className="text-sm">No routes configured yet. Add them in the Routes tab.</p>
          </div>
        )}
      </div>

      {/* Camera feeds for selected route */}
      <div>
        <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
          <Camera className="w-4 h-4 text-accent" />
          {route?.name || 'Select a route'} — Camera Feeds
        </h2>
        {ROUTES.length > 0 ? (
          ROUTES.map(routeData => (
            <div 
              key={routeData.id} 
              className={selectedRoute === routeData.id ? 'grid grid-cols-1 md:grid-cols-3 gap-4' : 'hidden'}
            >
              <CameraCard
                key={`${routeData.id}-bus_stand`}
                route={routeData}
                location="bus_stand"
                isFestival={isFestival}
                onReading={handleReading}
                latestReading={getLatest(routeData.id, 'bus_stand')}
              />
              <CameraCard
                key={`${routeData.id}-front_inside_bus`}
                route={routeData}
                location="front_inside_bus"
                isFestival={isFestival}
                onReading={handleReading}
                latestReading={getLatest(routeData.id, 'front_inside_bus')}
              />
              <CameraCard
                key={`${routeData.id}-back_inside_bus`}
                route={routeData}
                location="back_inside_bus"
                isFestival={isFestival}
                onReading={handleReading}
                latestReading={getLatest(routeData.id, 'back_inside_bus')}
              />
            </div>
          ))
        ) : (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-sm">No routes available or selected.</p>
          </div>
        )}
      </div>

      {/* Recent readings table */}
      <div>
        <h2 className="text-base font-semibold mb-3">Recent Readings — {route?.name || 'No Route Selected'}</h2>
        {routeReadings.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground bg-card rounded-2xl border border-border">
            <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No camera readings yet for this route.</p>
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
                      <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(r.created_date), 'MMM d, h:mm a')}</td>
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
