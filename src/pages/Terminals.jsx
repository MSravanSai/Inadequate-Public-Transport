import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Trash2, Edit2, Check, X, Shield, Bus } from 'lucide-react';
import { terminalsService } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Terminals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ city: '', name: '', short: '' });

  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => terminalsService.getTerminals(),
  });

  const create = useMutation({
    mutationFn: (terminal) => terminalsService.addTerminal(terminal),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminals'] });
      setOpen(false);
      setForm({ city: '', name: '', short: '' });
      toast({ title: 'Terminal added successfully' });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, updates }) => terminalsService.updateTerminal(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminals'] });
      setEditing(null);
      toast({ title: 'Terminal updated successfully' });
    },
  });

  const remove = useMutation({
    mutationFn: (id) => terminalsService.deleteTerminal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminals'] });
      toast({ title: 'Terminal deleted', variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!form.city || !form.name) {
      toast({ title: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }
    if (editing) {
      update.mutate({ id: editing, updates: form });
    } else {
      create.mutate(form);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Terminal Management</h1>
          <p className="text-muted-foreground text-sm">Configure cities and bus stand locations for monitoring.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => { setOpen(val); if(!val) { setEditing(null); setForm({ city: '', name: '', short: '' }); } }}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gap-2 shadow-lg shadow-primary/20">
              <Plus className="w-4 h-4" /> Add Terminal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Terminal' : 'Add New Terminal'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-tight">City Name</label>
                <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="e.g. Madurai" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-tight">Full Terminal Name</label>
                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Madurai Central Terminal" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground tracking-tight">Short Name (Sidebar)</label>
                <Input value={form.short} onChange={e => setForm({...form, short: e.target.value})} placeholder="e.g. Madurai" />
              </div>
              <Button className="w-full mt-4" onClick={handleSubmit} disabled={create.isPending || update.isPending}>
                {editing ? 'Update Terminal' : 'Create Terminal'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {terminals.map(terminal => (
            <div key={terminal.id} className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
               <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
               <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                    <Bus className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => { setForm(terminal); setEditing(terminal.id); setOpen(true); }}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive hover:bg-destructive/10" onClick={() => remove.mutate(terminal.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
               </div>
               <div>
                 <h3 className="font-bold text-lg text-foreground mb-1 leading-tight">{terminal.city}</h3>
                 <p className="text-xs text-muted-foreground font-medium mb-3">{terminal.name}</p>
                 <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-accent/5 rounded text-[10px] font-bold text-accent/60 tracking-wider uppercase border border-accent/10">Terminal ID: {terminal.id}</span>
                 </div>
               </div>
            </div>
          ))}
        </div>
      )}

      {terminals.length === 0 && !isLoading && (
        <div className="text-center py-20 bg-muted/20 border-2 border-dashed border-muted rounded-3xl">
           <MapPin className="w-12 h-12 text-muted mx-auto mb-4" />
           <h3 className="text-lg font-bold text-foreground">No terminals found</h3>
           <p className="text-muted-foreground">Add your first bus stand terminal to start monitoring.</p>
        </div>
      )}
    </div>
  );
}
