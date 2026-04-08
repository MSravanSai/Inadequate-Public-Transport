import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bus, Camera, AlertCircle, TrendingUp, MapPin, Clock, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/StatCard';
import CrowdBadge from '@/components/CrowdBadge';
import { format } from 'date-fns';

const ROUTES = [
  { id: 'r1', name: 'Madurai → Bangalore', color: 'bg-blue-500' },
  { id: 'r2', name: 'Madurai → Hyderabad', color: 'bg-purple-500' },
  { id: 'r3', name: 'Madurai → Chennai', color: 'bg-green-500' },
  { id: 'r4', name: 'Madurai → Coimbatore', color: 'bg-orange-500' },
];

const LOCATION_THRESHOLDS = {
  bus_stand: { normal: 40, festival: 80 },
  inside_bus: { normal: 60, festival: 80 },
};

function getCrowdLevel(count, isFestival, location = 'bus_stand') {
  const threshold = LOCATION_THRESHOLDS[location]?.[isFestival ? 'festival' : 'normal'] || 40;
  if (count < threshold * 0.4) return 'low';
  if (count < threshold * 0.7) return 'moderate';
  if (count < threshold) return 'high';
  return 'critical';
}

export default function Dashboard() {
  const { data: readings = [] } = useQuery({
    queryKey: ['crowd-readings'],
    queryFn: () => {
      const saved = localStorage.getItem('crowdReadings');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load readings from localStorage:', e);
        }
      }
      return Promise.resolve([]);
    },
    refetchInterval: 30000,
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['extra-bus-requests'],
    queryFn: () => {
      const saved = localStorage.getItem('busRequests');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load requests from localStorage:', e);
        }
      }
      return Promise.resolve([]);
    },
  });

  const { data: festivals = [] } = useQuery({
    queryKey: ['festival-days'],
    queryFn: () => {
      const saved = localStorage.getItem('festivals');
      if (saved) {
        try {
          return Promise.resolve(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load festivals from localStorage:', e);
        }
      }
      return Promise.resolve([]);
    },
  });


  const [exportFormat, setExportFormat] = useState('excel');
  const [liveTime, setLiveTime] = useState(format(new Date(), 'PPPP p'));
  const today = format(new Date(), 'yyyy-MM-dd');
  const isFestivalToday = festivals.some(f => f.date === today && f.is_active);
  const pendingRequests = requests.filter(r => r.status === 'pending').length;
  const criticalRoutes = readings.filter(r => r.crowd_level === 'critical').length;

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(format(new Date(), 'PPPP p'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get latest reading per route
  const latestByRoute = {};
  readings.forEach(r => {
    if (!latestByRoute[r.route_id] || new Date(r.created_date) > new Date(latestByRoute[r.route_id].created_date)) {
      latestByRoute[r.route_id] = r;
    }
  });

  const handleExportData = (formatType = exportFormat) => {
    const allData = {
      routes: JSON.parse(localStorage.getItem('routes') || '[]'),
      busRequests: JSON.parse(localStorage.getItem('busRequests') || '[]'),
      crowdReadings: JSON.parse(localStorage.getItem('crowdReadings') || '[]'),
      festivals: JSON.parse(localStorage.getItem('festivals') || '[]'),
      exportedAt: new Date().toISOString(),
    };

    if (!allData.routes.length) {
      allData.routes = ROUTES;
    }

    if (formatType === 'json') {
      const dataStr = JSON.stringify(allData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `bus-transport-data-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      return;
    }

    if (formatType === 'pdf') {
      const printHtml = [
        '<html><head><title>SmartBus Export</title>',
        '<style>body{font-family:sans-serif;padding:20px;}h1,h2{margin:0 0 12px;}table{width:100%;border-collapse:collapse;margin-bottom:24px;}th,td{border:1px solid #ccc;padding:8px;text-align:left;}th{background:#f4f4f4;}</style>',
        '</head><body>',
        `<h1>SmartBus Export</h1>`,
        `<h2>Routes</h2>`,
        '<table><tr><th>ID</th><th>Name</th><th>Color</th></tr>',
      ];
      (allData.routes.length ? allData.routes : ROUTES).forEach(route => {
        printHtml.push(`<tr><td>${route.id || ''}</td><td>${route.name || ''}</td><td>${route.color || ''}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('<h2>Bus Requests</h2>');
      printHtml.push('<table><tr><th>ID</th><th>Route</th><th>Location</th><th>People</th><th>Buses</th><th>Status</th><th>Reason</th><th>Created</th></tr>');
      allData.busRequests.forEach(req => {
        printHtml.push(`<tr><td>${req.id || ''}</td><td>${req.route_name || ''}</td><td>${req.location || ''}</td><td>${req.people_count || ''}</td><td>${req.buses_requested || ''}</td><td>${req.status || ''}</td><td>${req.reason || ''}</td><td>${req.created_date || ''}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('<h2>Crowd Readings</h2>');
      printHtml.push('<table><tr><th>ID</th><th>Route</th><th>Location</th><th>People</th><th>Level</th><th>Created</th></tr>');
      allData.crowdReadings.forEach(reading => {
        printHtml.push(`<tr><td>${reading.id || ''}</td><td>${reading.route_id || ''}</td><td>${reading.location || ''}</td><td>${reading.people_count || ''}</td><td>${reading.crowd_level || ''}</td><td>${reading.created_date || ''}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('<h2>Festivals</h2>');
      printHtml.push('<table><tr><th>ID</th><th>Name</th><th>Date</th><th>Description</th><th>Active</th></tr>');
      allData.festivals.forEach(festival => {
        printHtml.push(`<tr><td>${festival.id || ''}</td><td>${festival.name || ''}</td><td>${festival.date || ''}</td><td>${festival.description || ''}</td><td>${festival.is_active ? 'Yes' : 'No'}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('</body></html>');
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printHtml.join(''));
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
      }
      return;
    }

    const htmlRows = [];
    htmlRows.push('<html><head><meta charset="utf-8" /></head><body>');
    htmlRows.push('<h2>Routes</h2><table border="1"><tr><th>ID</th><th>Name</th><th>Color</th></tr>');
    (allData.routes.length ? allData.routes : ROUTES).forEach(route => {
      htmlRows.push(`<tr><td>${route.id || ''}</td><td>${route.name || ''}</td><td>${route.color || ''}</td></tr>`);
    });
    htmlRows.push('</table>');

    htmlRows.push('<h2>Bus Requests</h2><table border="1"><tr><th>ID</th><th>Route</th><th>Location</th><th>People</th><th>Buses</th><th>Status</th><th>Reason</th><th>Created</th></tr>');
    allData.busRequests.forEach(req => {
      htmlRows.push(`<tr><td>${req.id || ''}</td><td>${req.route_name || ''}</td><td>${req.location || ''}</td><td>${req.people_count || ''}</td><td>${req.buses_requested || ''}</td><td>${req.status || ''}</td><td>${req.reason || ''}</td><td>${req.created_date || ''}</td></tr>`);
    });
    htmlRows.push('</table>');

    htmlRows.push('<h2>Crowd Readings</h2><table border="1"><tr><th>ID</th><th>Route</th><th>Location</th><th>People</th><th>Level</th><th>Created</th></tr>');
    allData.crowdReadings.forEach(reading => {
      htmlRows.push(`<tr><td>${reading.id || ''}</td><td>${reading.route_id || ''}</td><td>${reading.location || ''}</td><td>${reading.people_count || ''}</td><td>${reading.crowd_level || ''}</td><td>${reading.created_date || ''}</td></tr>`);
    });
    htmlRows.push('</table>');

    htmlRows.push('<h2>Festivals</h2><table border="1"><tr><th>ID</th><th>Name</th><th>Date</th><th>Description</th><th>Active</th></tr>');
    allData.festivals.forEach(festival => {
      htmlRows.push(`<tr><td>${festival.id || ''}</td><td>${festival.name || ''}</td><td>${festival.date || ''}</td><td>${festival.description || ''}</td><td>${festival.is_active ? 'Yes' : 'No'}</td></tr>`);
    });
    htmlRows.push('</table></body></html>');

    const blob = new Blob([htmlRows.join('')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const exportFileDefaultName = `bus-transport-data-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xls`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', url);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Madurai Bus Stand</h1>
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
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <label htmlFor="export-format" className="text-xs text-muted-foreground">Export as</label>
            <select
              id="export-format"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="excel">Excel</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => handleExportData(exportFormat)}>
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export {exportFormat.toUpperCase()}
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
            <Clock className="w-3.5 h-3.5" />
            Live · {liveTime}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Routes" value={ROUTES.length} subtitle="Madurai Bus Stand" icon={Bus} color="accent" />
        <StatCard title="Pending Requests" value={pendingRequests} subtitle="Awaiting approval" icon={AlertCircle} color={pendingRequests > 0 ? 'red' : 'green'} />
        <StatCard title="Critical Alerts" value={criticalRoutes} subtitle="Overcrowded locations" icon={TrendingUp} color={criticalRoutes > 0 ? 'orange' : 'green'} />
        <StatCard title="Cameras Online" value={readings.length > 0 ? '8' : '0'} subtitle="Bus stand + in-bus" icon={Camera} color="blue" />
      </div>

      {/* Route Status Cards */}
      <div>
        <h2 className="text-base font-semibold mb-3 text-foreground">Route Status Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROUTES.map(route => {
            const reading = latestByRoute[route.id];
            const standReading = readings.filter(r => r.route_id === route.id && r.location === 'bus_stand').slice(-1)[0];
            const busReading = readings.filter(r => r.route_id === route.id && r.location === 'inside_bus').slice(-1)[0];
            const level = reading ? getCrowdLevel(reading.people_count, isFestivalToday, reading.location) : 'low';
            const pending = requests.filter(r => r.route_id === route.id && r.status === 'pending').length;

            return (
              <div key={route.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${route.color}`} />
                    <span className="font-semibold text-sm text-foreground">{route.name}</span>
                  </div>
                  <CrowdBadge level={level} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/60 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-1">Bus Stand</p>
                    <p className="text-xl font-bold text-foreground">{standReading?.people_count ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">people waiting</p>
                  </div>
                  <div className="bg-muted/60 rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-1">Inside Bus</p>
                    <p className="text-xl font-bold text-foreground">{busReading?.people_count ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">passengers</p>
                  </div>
                </div>

                {pending > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs text-orange-700 font-medium">{pending} extra bus request pending</span>
                  </div>
                )}

                {reading && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated: {format(new Date(reading.created_date), 'h:mm a')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Alerts */}
      {requests.filter(r => r.status === 'pending').length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3 text-foreground">Pending Alerts</h2>
          <div className="space-y-2">
            {requests.filter(r => r.status === 'pending').slice(0, 5).map(req => (
              <div key={req.id} className="bg-card border border-orange-200 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                    <Bus className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{req.route_name}</p>
                    <p className="text-xs text-muted-foreground">{req.people_count} people · {req.buses_requested} extra bus(es) requested</p>
                  </div>
                </div>
                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">Pending</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}