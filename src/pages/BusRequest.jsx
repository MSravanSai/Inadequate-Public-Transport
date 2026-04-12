import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, Bus, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { busRequestsService } from '@/services/backend';

const STATUS_CONFIG = {
  pending: { label: 'Pending', class: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved: { label: 'Approved', class: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', class: 'bg-red-100 text-red-700 border-red-200' },
  deployed: { label: 'Deployed', class: 'bg-blue-100 text-blue-700 border-blue-200' },
};

export default function BusRequests() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [liveClock, setLiveClock] = useState(format(new Date(), 'h:mm:ss a'));

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(format(new Date(), 'h:mm:ss a'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: requests = [] } = useQuery({
    queryKey: ['extra-bus-requests'],
    queryFn: () => busRequestsService.getAllRequests(),
    refetchInterval: 5000,
  });

  const updateRequest = useMutation({
    mutationFn: ({ id, data }) => busRequestsService.updateRequest(id, data),
    onSuccess: () => {
      setSelected(null);
      setAdminNotes('');
      queryClient.invalidateQueries({ queryKey: ['extra-bus-requests'] });
    },
  });

  const handleDecision = async (status) => {
    if (!selected) return;
    await updateRequest.mutateAsync({
      id: selected.id,
      data: {
        status,
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
      },
    });
    toast({
      title: status === 'approved' ? 'Request Approved' : 'Request Updated',
      description: `Task updated successfully.`,
    });
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Extra Bus Requests</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-0.5">
            <Clock className="w-3.5 h-3.5" />
            <span className="tabular-nums font-medium">{liveClock}</span>
            <span className="opacity-40 select-none mx-1">|</span>
            <span>Admin approval panel</span>
          </div>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-700 font-medium">{pending} awaiting approval</span>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'deployed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {s}
            {s === 'pending' && pending > 0 && <span className="ml-2 px-1.5 bg-orange-500 text-white text-[10px] rounded-full">{pending}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Bus className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No requests found in this category.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <div
              key={req.id}
              className={`bg-card border rounded-2xl p-5 shadow-sm cursor-pointer hover:shadow-md transition-all ${
                req.status === 'pending' ? 'border-orange-200' : 'border-border'
              }`}
              onClick={() => { setSelected(req); setAdminNotes(req.admin_notes || ''); }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    req.status === 'pending' ? 'bg-orange-100' : 'bg-muted'
                  }`}>
                    <Bus className={`w-5 h-5 ${req.status === 'pending' ? 'text-orange-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{req.route_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {(() => {
                           try {
                             return req.created_date ? format(new Date(req.created_date), 'MMM d, h:mm a') : 'Recently';
                           } catch {
                             return 'Recently';
                           }
                        })()}
                      </span>
                      <span>{req.people_count} people · {req.buses_requested} requested</span>
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${STATUS_CONFIG[req.status]?.class}`}>
                  {STATUS_CONFIG[req.status]?.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Details</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-xl text-sm space-y-1">
                <div className="flex justify-between"><span>Route</span><span className="font-bold">{selected.route_name}</span></div>
                <div className="flex justify-between"><span>People</span><span className="font-bold">{selected.people_count}</span></div>
                <div className="flex justify-between"><span>Requested</span><span className="font-bold">{selected.buses_requested} buses</span></div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground">Admin Notes</label>
                <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={3} className="mt-1" />
              </div>
              <div className="flex gap-2">
                {selected.status === 'pending' ? (
                  <>
                    <Button className="flex-1 bg-green-600" onClick={() => handleDecision('approved')}>Approve</Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200" onClick={() => handleDecision('rejected')}>Reject</Button>
                  </>
                ) : selected.status === 'approved' ? (
                  <Button className="w-full bg-blue-600" onClick={() => handleDecision('deployed')}>Mark Deployed</Button>
                ) : null}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
