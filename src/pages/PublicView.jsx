import { useQuery } from '@tanstack/react-query';
import { Bus, Clock, Users, MapPin, RefreshCw } from 'lucide-react';
import CrowdBadge from '@/components/CrowdBadge';
import { format } from 'date-fns';

const ROUTES = [
  { id: 'r1', name: 'Madurai → Bangalore', eta: '8h 30m' },
  { id: 'r2', name: 'Madurai → Hyderabad', eta: '14h' },
  { id: 'r3', name: 'Madurai → Chennai', eta: '7h 45m' },
  { id: 'r4', name: 'Madurai → Coimbatore', eta: '3h 30m' },
];

export default function PublicView() {
  const { data: readings = [], refetch, isFetching } = useQuery({
    queryKey: ['crowd-readings-public'],
    queryFn: () => {
      const saved = localStorage.getItem('crowdReadings');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load readings:', e);
        }
      }
      return Promise.resolve([]);
    },
    refetchInterval: 15000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['extra-bus-requests-public'],
    queryFn: () => {
      const saved = localStorage.getItem('busRequests');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load requests:', e);
        }
      }
      return Promise.resolve([]);
    },
    refetchInterval: 10000,
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ['festival-days-public'],
    queryFn: () => {
      const saved = localStorage.getItem('festivals');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load festivals:', e);
        }
      }
      return Promise.resolve([]);
    },
    refetchInterval: 10000,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const isFestival = festivals.some(f => f.date === today && f.is_active);

  const getLatestReading = (routeId, location) =>
    readings.filter(r => r.route_id === routeId && r.location === location).slice(0, 1)[0];

  const getApprovedBuses = (routeId) => {
    // Only show buses if there's actual crowd reading data for this route
    const hasReadingData = readings.some(r => r.route_id === routeId);
    if (!hasReadingData) return 0;
    
    return requests.filter(r => r.route_id === routeId && (r.status === 'approved' || r.status === 'deployed')).reduce((s, r) => s + (r.buses_approved || r.buses_requested || 0), 0);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-accent px-6 pt-10 pb-14 text-white">
        <div className="max-w-lg mx-auto text-center">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bus className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold">Madurai Bus Stand</h1>
          <p className="text-white/70 text-sm mt-1">Live crowd status for all routes</p>
          {isFestival && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm">
              🎉 Festival day — Expect higher crowds
            </div>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 text-white/60 text-xs">
            <Clock className="w-3.5 h-3.5" />
            {format(new Date(), 'MMMM d, yyyy · h:mm a')}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6 pb-10 space-y-4">
        {/* Refresh */}
        <div className="flex justify-end">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-4 py-2 shadow-md transition-all ${
              isFetching 
                ? 'bg-blue-500 text-white border-2 border-blue-600 shadow-lg shadow-blue-500/50 animate-pulse' 
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {ROUTES.map(route => {
          const standReading = getLatestReading(route.id, 'bus_stand');
          const busReading = getLatestReading(route.id, 'inside_bus');
          const extraBuses = getApprovedBuses(route.id);
          const level = standReading?.crowd_level || 'low';

          return (
            <div key={route.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Bus className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm text-foreground">{route.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{route.eta} journey</p>
                  </div>
                </div>
                {standReading && <CrowdBadge level={level} />}
              </div>

              <div className="px-5 pb-4 grid grid-cols-2 gap-2.5">
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Waiting at Stand</p>
                  <p className="text-2xl font-bold text-foreground">{standReading?.people_count ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">people</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">In Bus</p>
                  <p className="text-2xl font-bold text-foreground">{busReading?.people_count ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">passengers</p>
                </div>
              </div>

              {extraBuses > 0 && (
                <div className="mx-5 mb-4 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                  <Bus className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs text-green-700 font-medium">+{extraBuses} extra bus(es) deployed on this route</span>
                </div>
              )}

              {!standReading && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-center text-muted-foreground">No live data available yet</p>
                </div>
              )}
            </div>
          );
        })}

        <p className="text-center text-xs text-muted-foreground pt-2">
          Data updated every 30 seconds · SmartBus Crowd Manager
        </p>
      </div>
    </div>
  );
}