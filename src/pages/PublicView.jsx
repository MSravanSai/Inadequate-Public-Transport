import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bus, Clock, RefreshCw, Download, MapPin } from 'lucide-react';
import CrowdBadge from '@/components/CrowdBadge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { crowdReadingsService, busRequestsService, festivalsService, routesService } from '@/services/backend';
import { APP_CONFIG } from '@/config';

export default function PublicView() {
  const { data: routeList = [], refetch: refetchRoutes } = useQuery({
    queryKey: ['routes'],
    queryFn: () => routesService.getAllRoutes(),
  });
  
  const { data: readings = [], refetch: refetchReadings, isFetching } = useQuery({
    queryKey: ['crowd-readings'],
    queryFn: () => crowdReadingsService.getAllReadings(),
    refetchInterval: 15000,
  });

  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['extra-bus-requests-public'],
    queryFn: () => busRequestsService.getAllRequests(),
    refetchInterval: 10000,
  });

  const { data: festivals = [], refetch: refetchFestivals } = useQuery({
    queryKey: ['festival-days-public'],
    queryFn: () => festivalsService.getAllFestivals(),
    refetchInterval: 10000,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const isFestival = festivals.some(f => f.date === today && f.is_active);

  const [liveTime, setLiveTime] = useState(format(new Date(), 'MMMM d, yyyy · h:mm:ss a'));
  const [isManualRefresh, setIsManualRefresh] = useState(false);
  
  const [exportFormat, setExportFormat] = useState('excel');
  const [exportFrom, setExportFrom] = useState({ date: '', hour: '12', min: '00', ampm: 'AM' });
  const [exportTo, setExportTo] = useState({ date: '', hour: '11', min: '59', ampm: 'PM' });

  React.useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(format(new Date(), 'MMMM d, yyyy · h:mm:ss a'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    // If we're working in a raw file without importing useState explicitly
    const setSpin = window.document.getElementById('refresh-icon');
    if (setSpin) setSpin.classList.add('animate-spin');
    
    Promise.all([
      refetchRoutes(),
      refetchReadings(),
      refetchRequests(),
      refetchFestivals(),
      new Promise(res => setTimeout(res, 800))
    ]).finally(() => {
      if (setSpin) setSpin.classList.remove('animate-spin');
    });
  };

  const getLatestReading = (routeId, location) =>
    readings.filter(r => r.route_id === routeId && r.location === location)[0];

  const getApprovedBuses = (routeId) => {
    // Only show buses if there's actual crowd reading data for this route
    const hasReadingData = readings.some(r => r.route_id === routeId);
    if (!hasReadingData) return 0;
    
    return requests.filter(r => r.route_id === routeId && (r.status === 'approved' || r.status === 'deployed')).reduce((s, r) => s + (r.buses_approved || r.buses_requested || 0), 0);
  };

  const getFilterDate = (config) => {
    if (!config.date) return null;
    let h = parseInt(config.hour);
    if (config.ampm === 'PM' && h < 12) h += 12;
    if (config.ampm === 'AM' && h === 12) h = 0;
    const d = new Date(config.date);
    d.setHours(h, parseInt(config.min), 0, 0);
    return d.getTime();
  };

  const handleExportData = (formatType = exportFormat) => {
    let outReadings = readings || [];
    let outRequests = requests || [];

    const fromTime = getFilterDate(exportFrom);
    const toTime = getFilterDate(exportTo);

    if (fromTime || toTime) {
      const start = fromTime || 0;
      const end = toTime || Infinity;
      
      outReadings = outReadings.filter(r => {
        if (!r.created_date) return false;
        const pt = new Date(r.created_date).getTime();
        return pt >= start && pt <= end;
      });
      outRequests = outRequests.filter(r => {
        if (!r.created_date) return false;
        const pt = new Date(r.created_date).getTime();
        return pt >= start && pt <= end;
      });
    }

    const allData = {
      routes: routeList || [],
      busRequests: outRequests,
      crowdReadings: outReadings,
      festivals: festivals || [],
      exportedAt: new Date().toISOString(),
    };

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
        '<table><tr><th>Sl. No.</th><th>Name</th><th>People at Stand</th><th>People Inside Bus</th></tr>',
      ];
      allData.routes.forEach((route, i) => {
        const standReading = allData.crowdReadings.filter(r => r.route_id === route.id && r.location === 'bus_stand')[0];
        const busReading = allData.crowdReadings.filter(r => r.route_id === route.id && r.location === 'inside_bus')[0];
        printHtml.push(`<tr><td>${i + 1}</td><td>${route.name || ''}</td><td>${standReading?.people_count ?? '0'}</td><td>${busReading?.people_count ?? '0'}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('<h2>Bus Requests</h2>');
      printHtml.push('<table><tr><th>Sl. No.</th><th>Route</th><th>Location</th><th>People</th><th>Buses</th><th>Status</th><th>Reason</th><th>Created</th></tr>');
      allData.busRequests.forEach((req, i) => {
        printHtml.push(`<tr><td>${i + 1}</td><td>${req.route_name || ''}</td><td>${req.location || ''}</td><td>${req.people_count || ''}</td><td>${req.buses_requested || ''}</td><td>${req.status || ''}</td><td>${req.reason || ''}</td><td>${req.created_date || ''}</td></tr>`);
      });
      printHtml.push('</table>');

      printHtml.push('<h2>Crowd Readings</h2>');
      printHtml.push('<table><tr><th>Sl. No.</th><th>Route</th><th>Location</th><th>People</th><th>Level</th><th>Created</th></tr>');
      allData.crowdReadings.forEach((reading, i) => {
        printHtml.push(`<tr><td>${i + 1}</td><td>${reading.route_name || reading.route_id || ''}</td><td>${reading.location || ''}</td><td>${reading.people_count || ''}</td><td>${reading.crowd_level || ''}</td><td>${reading.created_date || ''}</td></tr>`);
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
    htmlRows.push('<h2>Routes</h2><table border="1"><tr><th>Sl. No.</th><th>Name</th><th>People at Stand</th><th>People Inside Bus</th></tr>');
    allData.routes.forEach((route, i) => {
      const standReading = allData.crowdReadings.filter(r => r.route_id === route.id && r.location === 'bus_stand')[0];
      const busReading = allData.crowdReadings.filter(r => r.route_id === route.id && r.location === 'inside_bus')[0];
      htmlRows.push(`<tr><td>${i + 1}</td><td>${route.name || ''}</td><td>${standReading?.people_count ?? '0'}</td><td>${busReading?.people_count ?? '0'}</td></tr>`);
    });
    htmlRows.push('</table>');

    htmlRows.push('<h2>Bus Requests</h2><table border="1"><tr><th>Sl. No.</th><th>Route</th><th>Location</th><th>People</th><th>Buses</th><th>Status</th><th>Reason</th><th>Created</th></tr>');
    allData.busRequests.forEach((req, i) => {
      htmlRows.push(`<tr><td>${i + 1}</td><td>${req.route_name || ''}</td><td>${req.location || ''}</td><td>${req.people_count || ''}</td><td>${req.buses_requested || ''}</td><td>${req.status || ''}</td><td>${req.reason || ''}</td><td>${req.created_date || ''}</td></tr>`);
    });
    htmlRows.push('</table>');

    htmlRows.push('<h2>Crowd Readings</h2><table border="1"><tr><th>Sl. No.</th><th>Route</th><th>Location</th><th>People</th><th>Level</th><th>Created</th></tr>');
    allData.crowdReadings.forEach((reading, i) => {
      htmlRows.push(`<tr><td>${i + 1}</td><td>${reading.route_name || reading.route_id || ''}</td><td>${reading.location || ''}</td><td>${reading.people_count || ''}</td><td>${reading.crowd_level || ''}</td><td>${reading.created_date || ''}</td></tr>`);
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
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary to-accent px-6 pt-10 pb-14 text-white">
        <div className="max-w-lg mx-auto text-center">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Bus className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold">{APP_CONFIG.full_name}</h1>
          <p className="text-white/70 text-sm mt-1">Live crowd status for all routes</p>
          {isFestival && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white/15 rounded-full px-4 py-1.5 text-sm">
              🎉 Festival day — Expect higher crowds
            </div>
          )}
          <div className="mt-3 flex items-center justify-center gap-2 text-white/60 text-xs tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            {liveTime}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6 pb-10 space-y-4">
        <div className="flex justify-end">
          <button
            onClick={handleRefresh}
            className={`flex items-center gap-1.5 text-xs font-medium rounded-lg px-4 py-2 shadow-md transition-all bg-white text-slate-700 border border-slate-200 hover:bg-slate-50`}
          >
            <RefreshCw id="refresh-icon" className={`w-3.5 h-3.5`} />
            Refresh
          </button>
        </div>

        {routeList.map(route => {
          const standReading = getLatestReading(route.id, 'bus_stand');
          const busReading = getLatestReading(route.id, 'inside_bus');
          const extraBuses = getApprovedBuses(route.id);
          const level = standReading?.crowd_level || 'low';
          const estimatedHours = Math.round(route.distance_km / 50 || 0);

          return (
            <div key={route.id} className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Bus className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-semibold text-sm text-foreground">{route.name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />~{estimatedHours}h journey ({route.distance_km} km)</p>
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

        {/* Export Data Section */}
        <div className="mt-8 pt-6 border-t border-border space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Download className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Extract Historical Reports</h3>
          </div>
          
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">From Date & Time</span>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="date"
                    value={exportFrom.date}
                    onChange={(e) => setExportFrom({ ...exportFrom, date: e.target.value })}
                    className="bg-muted text-xs text-foreground outline-none cursor-pointer rounded-lg px-2 py-2 w-full sm:w-[130px]"
                  />
                  <div className="flex items-center gap-1 bg-muted px-2 py-1.5 rounded-lg">
                    <select 
                      value={exportFrom.hour}
                      onChange={(e) => setExportFrom({...exportFrom, hour: e.target.value})}
                      className="bg-transparent border-none text-xs text-foreground outline-none cursor-pointer"
                    >
                      {Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">:</span>
                    <select 
                      value={exportFrom.min}
                      onChange={(e) => setExportFrom({...exportFrom, min: e.target.value})}
                      className="bg-transparent border-none text-xs text-foreground outline-none cursor-pointer"
                    >
                      {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select 
                      value={exportFrom.ampm}
                      onChange={(e) => setExportFrom({...exportFrom, ampm: e.target.value})}
                      className="bg-transparent border-none text-xs font-bold text-primary outline-none cursor-pointer ml-1"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">To Date & Time</span>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="date"
                    value={exportTo.date}
                    onChange={(e) => setExportTo({ ...exportTo, date: e.target.value })}
                    className="bg-muted text-xs text-foreground outline-none cursor-pointer rounded-lg px-2 py-2 w-full sm:w-[130px]"
                  />
                  <div className="flex items-center gap-1 bg-muted px-2 py-1.5 rounded-lg">
                    <select 
                      value={exportTo.hour}
                      onChange={(e) => setExportTo({...exportTo, hour: e.target.value})}
                      className="bg-transparent border-none text-xs text-foreground outline-none cursor-pointer"
                    >
                      {Array.from({length: 12}, (_, i) => (i + 1).toString().padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                    <span className="text-xs text-muted-foreground">:</span>
                    <select 
                      value={exportTo.min}
                      onChange={(e) => setExportTo({...exportTo, min: e.target.value})}
                      className="bg-transparent border-none text-xs text-foreground outline-none cursor-pointer"
                    >
                      {['00','15','30','45','59'].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select 
                      value={exportTo.ampm}
                      onChange={(e) => setExportTo({...exportTo, ampm: e.target.value})}
                      className="bg-transparent border-none text-xs font-bold text-primary outline-none cursor-pointer ml-1"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center justify-between border border-border bg-background px-3 py-2 rounded-xl">
                 <span className="text-xs text-muted-foreground">Format</span>
                 <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  className="bg-transparent border-none text-xs text-foreground font-bold outline-none"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="excel">Excel</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>

            <Button 
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold flex items-center justify-center gap-2"
              onClick={() => handleExportData()}
            >
              <Download className="w-4 h-4" />
              Download {exportFormat.toUpperCase()} Report
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
