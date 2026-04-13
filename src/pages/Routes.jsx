import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Bus, Edit2, Trash2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { routesService, terminalsService } from '@/services/backend';
import { BUS_STANDS } from '@/config';

const DEFAULT_ROUTES = [
  // Madurai
  { terminal_id: 'madurai', source: 'Madurai', destination: 'Bangalore', distance_km: 452, stand_threshold: 60, stand_festival_threshold: 85, bus_threshold: 40, bus_festival_threshold: 60, scheduled_buses: 8, is_active: true },
  { terminal_id: 'madurai', source: 'Madurai', destination: 'Chennai', distance_km: 460, stand_threshold: 60, stand_festival_threshold: 85, bus_threshold: 40, bus_festival_threshold: 60, scheduled_buses: 12, is_active: true },
  // Bangalore 
  { terminal_id: 'bangalore', source: 'Bangalore', destination: 'Mysore', distance_km: 145, stand_threshold: 50, stand_festival_threshold: 75, bus_threshold: 30, bus_festival_threshold: 50, scheduled_buses: 15, is_active: true },
  { terminal_id: 'bangalore', source: 'Bangalore', destination: 'Goa', distance_km: 560, stand_threshold: 40, stand_festival_threshold: 60, bus_threshold: 25, bus_festival_threshold: 40, scheduled_buses: 5, is_active: true },
  // Chennai
  { terminal_id: 'chennai', source: 'Chennai', destination: 'Pondicherry', distance_km: 150, stand_threshold: 55, stand_festival_threshold: 80, bus_threshold: 35, bus_festival_threshold: 55, scheduled_buses: 20, is_active: true },
  { terminal_id: 'chennai', source: 'Chennai', destination: 'Madurai', distance_km: 460, stand_threshold: 60, stand_festival_threshold: 85, bus_threshold: 40, bus_festival_threshold: 60, scheduled_buses: 10, is_active: true },
  // Coimbatore
  { terminal_id: 'coimbatore', source: 'Coimbatore', destination: 'Ooty', distance_km: 86, stand_threshold: 40, stand_festival_threshold: 70, bus_threshold: 20, bus_festival_threshold: 40, scheduled_buses: 25, is_active: true },
  { terminal_id: 'coimbatore', source: 'Coimbatore', destination: 'Kerala', distance_km: 180, stand_threshold: 50, stand_festival_threshold: 75, bus_threshold: 30, bus_festival_threshold: 50, scheduled_buses: 8, is_active: true },
];

const empty = { source: '', destination: '', distance_km: '', stand_threshold: '', stand_festival_threshold: '', bus_threshold: '', bus_festival_threshold: '', scheduled_buses: 6, is_active: true };

export default function Routes() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const autoSeededRef = useRef(false);
  const cleanupRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [liveClock, setLiveClock] = useState(format(new Date(), 'h:mm:ss a'));
  const currentStandId = localStorage.getItem('selectedTerminal') || 'madurai';
  const { data: terminals = BUS_STANDS } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => terminalsService.getTerminals(),
  });
  const stand = terminals.find(s => s.id === currentStandId) || terminals[0] || BUS_STANDS[0];

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(format(new Date(), 'h:mm:ss a'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: routes = [], isLoading } = useQuery({
    queryKey: ['routes'],
    queryFn: () => routesService.getRoutes(),
  });

  const uniqueRoutes = routes.filter((route, index, list) => {
    const key = `${route.source || route.name}|${route.destination}`;
    return index === list.findIndex(item => `${item.source || item.name}|${item.destination}` === key);
  });

  const duplicateRoutes = routes.filter((route, index, list) => {
    const key = `${route.source || route.name}|${route.destination}`;
    return index !== list.findIndex(item => `${item.source || item.name}|${item.destination}` === key);
  });

  const create = useMutation({
    mutationFn: (data) => routesService.addRoute(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      setOpen(false);
      setForm(empty);
      toast({ title: 'Route added' });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => routesService.updateRoute(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      setOpen(false);
      setEditing(null);
      toast({ title: 'Route updated' });
    },
  });

  const remove = useMutation({
    mutationFn: (id) => routesService.deleteRoute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routes'] });
      toast({ title: 'Route deleted' });
    },
  });

  const validate = (data) => {
    const nextErrors = {};

    if (!data.source?.trim()) {
      nextErrors.source = 'Source is required.';
    }
    if (!data.destination?.trim()) {
      nextErrors.destination = 'Destination is required.';
    }
    if (!data.distance_km?.toString().trim()) {
      nextErrors.distance_km = 'Distance is required.';
    } else if (Number(data.distance_km) <= 0) {
      nextErrors.distance_km = 'Distance must be greater than zero.';
    }
    if (!data.stand_threshold?.toString().trim()) {
      nextErrors.stand_threshold = 'Bus stand threshold is required.';
    }
    if (!data.bus_threshold?.toString().trim()) {
      nextErrors.bus_threshold = 'Inside bus threshold is required.';
    }
    if (Number(data.scheduled_buses) <= 0) {
      nextErrors.scheduled_buses = 'Scheduled buses must be greater than zero.';
    }

    return nextErrors;
  };

  const handleSeed = async () => {
    const existingKeys = new Set(uniqueRoutes.map(r => `${r.source || r.name}|${r.destination}`));
    const missing = DEFAULT_ROUTES.filter(r => !existingKeys.has(`${r.source}|${r.destination}`));

    if (!missing.length) return;

    await Promise.all(missing.map(route => routesService.addRoute(route)));
    queryClient.invalidateQueries({ queryKey: ['routes'] });
    toast({ title: 'Sample routes added' });
  };

  useEffect(() => {
    if (!isLoading && !autoSeededRef.current) {
      const existingKeys = new Set(uniqueRoutes.map(r => `${r.name}|${r.destination}`));
      const missing = DEFAULT_ROUTES.filter(r => !existingKeys.has(`${r.name}|${r.destination}`));
      if (!missing.length) return;
      autoSeededRef.current = true;
      handleSeed();
    }
  }, [handleSeed, isLoading, uniqueRoutes]);

  useEffect(() => {
    if (isLoading || cleanupRef.current || duplicateRoutes.length === 0) return;
    cleanupRef.current = true;

    Promise.all(duplicateRoutes.map(route => routesService.deleteRoute(route.id)))
      .then(() => queryClient.invalidateQueries({ queryKey: ['routes'] }))
      .catch(() => {
        cleanupRef.current = false;
      });
  }, [duplicateRoutes, isLoading, queryClient]);

  const handleSubmit = () => {
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const data = {
      ...form,
      distance_km: Number(form.distance_km),
      normal_threshold: Number(form.normal_threshold),
      festival_threshold: Number(form.festival_threshold),
      scheduled_buses: Number(form.scheduled_buses),
    };

    if (editing) update.mutate({ id: editing, data });
    else create.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Routes</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums font-medium">{liveClock}</span>
            <span className="opacity-40 select-none mx-1">|</span>
            <span>Manage bus routes from {stand.city}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {uniqueRoutes.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed}>Seed Sample Routes</Button>
          )}
          <Button size="sm" onClick={() => { setForm(empty); setEditing(null); setErrors({}); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Route
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading...</div>
      ) : uniqueRoutes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Bus className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm mb-4">No routes configured yet.</p>
          <Button variant="outline" onClick={handleSeed}>Add Sample Routes</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {uniqueRoutes.map(r => (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground uppercase tracking-tight">
                    {r.source} <span className="text-muted-foreground/40 mx-1">→</span> {r.destination}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.distance_km} km · {r.scheduled_buses} scheduled buses/day</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => { setForm(r); setEditing(r.id); setErrors({}); setOpen(true); }}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:bg-destructive/10" onClick={() => remove.mutate(r.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/50">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Bus Stand</p>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium">Normal: <span className="text-foreground">{r.stand_threshold || r.normal_threshold || '40'}</span></span>
                      <span className="text-[11px] font-medium text-orange-600">Fest: <span className="text-foreground">{r.stand_festival_threshold || r.festival_threshold || '80'}</span></span>
                    </div>
                  </div>
                  <div className="bg-muted/40 rounded-xl p-3 border border-border/50">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Inside Bus</p>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium">Normal: <span className="text-foreground">{r.bus_threshold || r.normal_threshold || '60'}</span></span>
                      <span className="text-[11px] font-medium text-orange-600">Fest: <span className="text-foreground">{r.bus_festival_threshold || r.festival_threshold || '80'}</span></span>
                    </div>
                  </div>
                </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Route' : 'Add Route'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <p className="text-[11px] font-bold uppercase text-muted-foreground tracking-tight">Endpoints</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={form.source || ''} onChange={e => setForm({...form, source: e.target.value})} placeholder="Source" className={errors.source ? 'border-destructive border-2' : ''} />
                  <Input value={form.destination || ''} onChange={e => setForm({...form, destination: e.target.value})} placeholder="Destination" className={errors.destination ? 'border-destructive border-2' : ''} />
                </div>
              </div>

              <div className="col-span-2 space-y-1.5 pt-1">
                <p className="text-[11px] font-bold uppercase text-muted-foreground tracking-tight">Bus Stand (Normal / Fest)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={form.stand_threshold || ''} onChange={e => setForm({...form, stand_threshold: e.target.value})} placeholder="Normal" className={errors.stand_threshold ? 'border-destructive border-2' : ''} />
                  <Input type="number" value={form.stand_festival_threshold || ''} onChange={e => setForm({...form, stand_festival_threshold: e.target.value})} placeholder="Festival" className="border-orange-200" />
                </div>
              </div>

              <div className="col-span-2 space-y-1.5 pt-1">
                <p className="text-[11px] font-bold uppercase text-muted-foreground tracking-tight">Inside Bus (Normal / Fest)</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={form.bus_threshold || ''} onChange={e => setForm({...form, bus_threshold: e.target.value})} placeholder="Normal" className={errors.bus_threshold ? 'border-destructive border-2' : ''} />
                  <Input type="number" value={form.bus_festival_threshold || ''} onChange={e => setForm({...form, bus_festival_threshold: e.target.value})} placeholder="Festival" className="border-orange-200" />
                </div>
              </div>

              <div className="col-span-2 space-y-1.5 pt-1">
                <p className="text-[11px] font-bold uppercase text-muted-foreground tracking-tight">Fleet & Distance</p>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" value={form.scheduled_buses || ''} onChange={e => setForm({...form, scheduled_buses: e.target.value})} placeholder="Buses/Day" className={errors.scheduled_buses ? 'border-destructive border-2' : ''} />
                  <Input type="number" value={form.distance_km || ''} onChange={e => setForm({...form, distance_km: e.target.value})} placeholder="Distance (km)" className={errors.distance_km ? 'border-destructive border-2' : ''} />
                </div>
              </div>
            </div>
            <Button className="w-full mt-2" onClick={handleSubmit} disabled={create.isPending || update.isPending}>
              {editing ? 'Save Changes' : 'Add Route'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
