import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Calendar, Trash2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { festivalsService } from '@/services/firebase';

const SAMPLE_FESTIVALS = [
  { name: 'Dussehra', date: '2026-10-02', description: 'Major Hindu festival' },
  { name: 'Diwali', date: '2026-10-20', description: 'Festival of lights' },
  { name: 'Christmas', date: '2026-12-25', description: 'Christmas holiday' },
  { name: 'New Year', date: '2026-01-01', description: "New Year's Day" },
  { name: 'Pongal', date: '2026-01-14', description: 'Tamil harvest festival' },
];

const empty = { name: '', date: '', description: '', is_active: true };

export default function Festivals() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: festivals = [], isLoading } = useQuery({
    queryKey: ['festival-days'],
    queryFn: () => festivalsService.getAllFestivals(),
  });

  const create = useMutation({
    mutationFn: (data) => festivalsService.addFestival(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival-days'] });
      setOpen(false);
      setForm(empty);
      toast({ title: 'Festival day added' });
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }) => festivalsService.updateFestival(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival-days'] });
      toast({ title: 'Festival updated' });
    },
  });

  const remove = useMutation({
    mutationFn: (id) => festivalsService.deleteFestival(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['festival-days'] });
      toast({ title: 'Deleted' });
    },
  });

  const handleSeed = async () => {
    const seeded = SAMPLE_FESTIVALS.map(f => ({
      ...f,
      id: f.name.toLowerCase().replace(' ', '-'),
      is_active: false,
    }));
    // Add all sample festivals to Firebase
    await Promise.all(seeded.map(festival => festivalsService.addFestival(festival)));
    queryClient.invalidateQueries({ queryKey: ['festival-days'] });
    toast({ title: 'Sample festivals added' });
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Festival Days</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Lower crowd thresholds apply on these days</p>
        </div>
        <div className="flex gap-2">
          {festivals.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed}>Seed Sample</Button>
          )}
          <Button size="sm" onClick={() => { setForm(empty); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Festival
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3 shadow-sm">
        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
          <Star className="w-5 h-5 text-orange-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Festival Mode Thresholds</p>
          <p className="text-xs text-muted-foreground">On festival days, extra buses are triggered at <strong>85 people</strong> instead of the normal 60.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Loading...</div>
      ) : festivals.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Calendar className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm mb-4">No festival days configured.</p>
          <Button variant="outline" onClick={handleSeed}>Add Sample Festivals</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {festivals.map(f => {
            const isToday = f.date === today;
            return (
              <div key={f.id} className={`bg-card rounded-2xl border p-4 shadow-sm ${isToday ? 'border-orange-300 ring-1 ring-orange-200' : 'border-border'} ${!f.is_active ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🎉</span>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{f.name}</p>
                      {isToday && <span className="text-xs text-orange-600 font-medium">Today!</span>}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="w-6 h-6 text-destructive hover:bg-destructive/10" onClick={() => remove.mutate(f.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{f.date} {f.description && `· ${f.description}`}</p>
                <button
                  onClick={() => toggle.mutate({ id: f.id, is_active: !f.is_active })}
                  className={`w-full text-xs py-1.5 rounded-lg font-medium transition-all ${f.is_active ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
                >
                  {f.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Festival Day</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Festival Name</Label><Input placeholder="e.g. Diwali" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs">Description (optional)</Label><Input placeholder="Brief description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
            <Button className="w-full mt-2" onClick={() => create.mutate(form)} disabled={!form.name || !form.date || create.isPending}>Add Festival</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}