import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Bus, Edit2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_ROUTES = [
  { id: 1, name: 'Madurai → Bangalore', destination: 'Bangalore', distance_km: 452, normal_threshold: '', festival_threshold: '', scheduled_buses: 8 },
  { id: 2, name: 'Madurai → Hyderabad', destination: 'Hyderabad', distance_km: 812, normal_threshold: '', festival_threshold: '', scheduled_buses: 4 },
  { id: 3, name: 'Madurai → Chennai', destination: 'Chennai', distance_km: 460, normal_threshold: '', festival_threshold: '', scheduled_buses: 12 },
  { id: 4, name: 'Madurai → Coimbatore', destination: 'Coimbatore', distance_km: 213, normal_threshold: '', festival_threshold: '', scheduled_buses: 10 },
];

const empty = { name: '', destination: '', distance_km: '', normal_threshold: '', festival_threshold: '', scheduled_buses: 6, is_active: true };

export default function Routes() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [routes, setRoutes] = useState(DEFAULT_ROUTES);
  const [errors, setErrors] = useState({});
  const { toast } = useToast();
  const isLoading = false;

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('routes');
    if (saved) {
      try {
        setRoutes(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load routes from localStorage:', e);
      }
    }
  }, []);

  // Save to localStorage whenever routes change
  useEffect(() => {
    localStorage.setItem('routes', JSON.stringify(routes));
  }, [routes]);


  const create = useMutation({
    mutationFn: (data) => Promise.resolve({ ...data, id: Date.now() }),
    onSuccess: (newRoute) => {
      setRoutes(prev => [...prev, newRoute]);
      setOpen(false);
      setForm(empty);
      toast({ title: 'Route added' });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }) => Promise.resolve({ id, ...data }),
    onSuccess: ({ id, ...data }) => {
      setRoutes(prev => prev.map(route => route.id === id ? { ...route, ...data } : route));
      setOpen(false);
      setEditing(null);
      toast({ title: 'Route updated' });
    },
  });

  const remove = useMutation({
    mutationFn: (id) => Promise.resolve(id),
    onSuccess: (id) => {
      setRoutes(prev => prev.filter(route => route.id !== id));
      toast({ title: 'Route deleted' });
    },
  });

  const validate = (data) => {
    const nextErrors = {};

    if (!data.name?.trim()) {
      nextErrors.name = 'Route name is required.';
    }
    if (!data.destination?.trim()) {
      nextErrors.destination = 'Destination is required.';
    }
    if (!data.distance_km?.toString().trim()) {
      nextErrors.distance_km = 'Distance is required.';
    } else if (Number(data.distance_km) <= 0) {
      nextErrors.distance_km = 'Distance must be greater than zero.';
    }
    if (!data.scheduled_buses?.toString().trim()) {
      nextErrors.scheduled_buses = 'Scheduled buses is required.';
    } else if (Number(data.scheduled_buses) <= 0) {
      nextErrors.scheduled_buses = 'Scheduled buses must be greater than zero.';
    }

    return nextErrors;
  };

  const handleSeed = async () => {
    setRoutes(DEFAULT_ROUTES);
    toast({ title: 'Sample routes added' });
  };

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
          <p className="text-muted-foreground text-sm mt-0.5">Manage bus routes from Madurai</p>
        </div>
        <div className="flex gap-2">
          {routes.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed}>Seed Sample Routes</Button>
          )}
          <Button size="sm" onClick={() => { setForm(empty); setEditing(null); setErrors({}); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Route
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading...</div>
      ) : routes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Bus className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm mb-4">No routes configured yet.</p>
          <Button variant="outline" onClick={handleSeed}>Add Sample Routes</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routes.map(r => (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-foreground">{r.name}</p>
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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-muted-foreground">Normal Threshold</p>
                  <p className="font-semibold mt-0.5">{r.normal_threshold} people</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-2.5">
                  <p className="text-orange-600">Festival Threshold</p>
                  <p className="font-semibold mt-0.5 text-orange-700">{r.festival_threshold} people</p>
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
            {[
              { label: 'Route Name', key: 'name', placeholder: 'Madurai → Bangalore' },
              { label: 'Destination', key: 'destination', placeholder: 'Bangalore' },
              { label: 'Distance (km)', key: 'distance_km', type: 'number' },
              { label: 'Normal Threshold (people)', key: 'normal_threshold', type: 'number' },
              { label: 'Festival Threshold (people)', key: 'festival_threshold', type: 'number' },
              { label: 'Scheduled Buses/Day', key: 'scheduled_buses', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type={f.type || 'text'}
                  placeholder={f.placeholder}
                  value={form[f.key] || ''}
                  onChange={e => {
                    setForm(p => ({ ...p, [f.key]: e.target.value }));
                    setErrors(p => ({ ...p, [f.key]: undefined }));
                  }}
                  className="mt-1"
                />
                {errors[f.key] && <p className="text-xs text-destructive mt-1">{errors[f.key]}</p>}
              </div>
            ))}
            <Button className="w-full mt-2" onClick={handleSubmit} disabled={create.isPending || update.isPending}>
              {editing ? 'Save Changes' : 'Add Route'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}