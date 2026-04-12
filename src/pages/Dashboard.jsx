import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bus, Camera, AlertCircle, TrendingUp, MapPin, Clock } from 'lucide-react';
import StatCard from '@/components/StatCard';
import CrowdBadge from '@/components/CrowdBadge';
import { format } from 'date-fns';
import { crowdReadingsService, busRequestsService, festivalsService, routesService } from '@/services/backend';
import { APP_CONFIG } from '@/config';

export default function Dashboard() {
  const { data: readings = [] } = useQuery({
    queryKey: ['crowd-readings'],
    queryFn: () => crowdReadingsService.getAllReadings(),
    refetchInterval: 30000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['extra-bus-requests'],
    queryFn: () => busRequestsService.getAllRequests(),
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ['festival-days'],
    queryFn: () => festivalsService.getAllFestivals(),
  });

  const { data: routes = [] } = useQuery({
    queryKey: ['routes'],
    queryFn: () => routesService.getAllRoutes(),
  });

  const [liveTime, setLiveTime] = useState(format(new Date(), 'PPPP · h:mm:ss a'));
  const today = format(new Date(), 'yyyy-MM-dd');
  const isFestivalToday = festivals.some(f => f.date === today && f.is_active);
  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(format(new Date(), 'PPPP · h:mm:ss a'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Map latest reading per route AND location
  const latestMap = {};
  readings.forEach(r => {
    const key = `${r.route_id}:${r.location}`;
    const rDate = r.created_date ? new Date(r.created_date).getTime() : 0;
    const latestDate = latestMap[key]?.created_date ? new Date(latestMap[key].created_date).getTime() : 0;
    if (!latestMap[key] || rDate > latestDate) {
      latestMap[key] = r;
    }
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{APP_CONFIG.full_name}</h1>
          <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            Crowd Monitoring Dashboard
            {isFestivalToday && (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">
                🎉 Festival Day
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-right tabular-nums">
            <span className="block text-lg font-bold text-foreground">{liveTime.split('·')[1]}</span>
            <span className="block text-[10px] text-muted-foreground uppercase tracking-widest">{liveTime.split('·')[0]}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Routes"
          value={routes.length}
          icon={MapPin}
          trend="+2 new today"
          color="blue"
        />
        <StatCard
          title="Total Crowd"
          value={Object.values(latestMap).reduce((sum, r) => sum + (r.people_count || 0), 0)}
          icon={TrendingUp}
          trend="Live coverage"
          color="purple"
        />
        <StatCard
          title="Pending Requests"
          value={pendingRequests}
          icon={AlertCircle}
          trend="Needs attention"
          color="orange"
          isAlert={pendingRequests > 0}
        />
        <StatCard
          title="Festival Mode"
          value={isFestivalToday ? "Active" : "Standard"}
          icon={Bus}
          trend={isFestivalToday ? "Higher caps" : "Normal caps"}
          color={isFestivalToday ? "green" : "blue"}
        />
      </div>

      <div>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5 text-primary" />
          Real-time Route Status
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {routes.map((route) => {
            const standReading = latestMap[`${route.id}:bus_stand`];
            const frontReading = latestMap[`${route.id}:front_inside_bus`];
            const backReading = latestMap[`${route.id}:back_inside_bus`];
            // Old data compatibility
            const legacyInside = latestMap[`${route.id}:inside_bus`];
            
            const standCount = standReading?.people_count ?? 0;
            const insideCount = (frontReading?.people_count ?? 0) + (backReading?.people_count ?? 0) + (legacyInside?.people_count ?? 0);
            
            const totalForRoute = standCount + insideCount;
            const level = getCrowdLevel(standCount, insideCount, isFestivalToday);
            const pending = requests.filter(r => r.route_id === route.id && r.status === 'pending').length;

            const lastUpdated = [standReading, frontReading, backReading, legacyInside]
              .filter(Boolean)
              .map(r => new Date(r.created_date).getTime())
              .sort((a, b) => b - a)[0];

            return (
              <div key={route.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-foreground">{route.name}</h3>
                    <p className="text-xs text-muted-foreground">{route.destination}</p>
                  </div>
                  <CrowdBadge level={level} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/60 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Bus Stand</p>
                    <p className="text-xl font-bold text-foreground">{standCount}</p>
                    <p className="text-[10px] text-muted-foreground">people waiting</p>
                  </div>
                  <div className="bg-muted/60 rounded-xl p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Inside Bus</p>
                    <p className="text-xl font-bold text-foreground">{insideCount}</p>
                    <p className="text-[10px] text-muted-foreground">passengers</p>
                  </div>
                </div>

                {pending > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs text-orange-700 font-medium">{pending} request pending</span>
                  </div>
                )}

                {lastUpdated && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {format(new Date(lastUpdated), 'h:mm a')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getCrowdLevel(standCount, insideCount, isFestival) {
   const standLimit = isFestival ? 80 : 40;
   const insideLimit = isFestival ? 80 : 60;
   
   const standFactor = standCount / standLimit;
   const insideFactor = insideCount / insideLimit;
   const maxFactor = Math.max(standFactor, insideFactor);

   if (maxFactor < 0.4) return 'low';
   if (maxFactor < 0.7) return 'moderate';
   if (maxFactor < 1.0) return 'high';
   return 'critical';
}
