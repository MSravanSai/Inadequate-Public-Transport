import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Bus, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';

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
  const [requests, setRequests] = useState([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load from localStorage on mount - only auto-generated requests from LiveMonitor
  useEffect(() => {
    const saved = localStorage.getItem('busRequests');
    if (saved) {
      try {
        setRequests(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load bus requests from localStorage:', e);
      }
    }
  }, []);

  // Save to localStorage whenever requests change
  useEffect(() => {
    localStorage.setItem('busRequests', JSON.stringify(requests));
  }, [requests]);


  const updateRequest = useMutation({
    mutationFn: ({ id, data }) => Promise.resolve({ id, data }),
    onSuccess: ({ id, data }) => {
      setRequests(prev => prev.map(req => req.id === id ? { ...req, ...data } : req));
      setSelected(null);
      setAdminNotes('');
      // Invalidate queries to refresh data across components
      queryClient.invalidateQueries({ queryKey: ['extra-bus-requests'] });
      queryClient.invalidateQueries({ queryKey: ['crowd-readings'] });
    },
  });

  const handleDecision = async (status) => {
    await updateRequest.mutateAsync({
      id: selected.id,
      data: {
        status,
        admin_notes: adminNotes,
        resolved_at: new Date().toISOString(),
      },
    });
    toast({
      title:
        status === 'approved'
          ? 'Request Approved'
          : status === 'rejected'
          ? 'Request Rejected'
          : 'Request Updated',
      description: `Extra bus request for ${selected?.route_name || selected?.route_id} has been ${status}.`,
    });
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pending = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Extra Bus Requests</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Admin approval panel</p>
        </div>
        {pending > 0 && (
          <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-2">
            <AlertCircle className="w-4 h-4 text-orange-600" />
            <span className="text-sm text-orange-700 font-medium">{pending} awaiting approval</span>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'deployed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {s === 'all' ? 'All' : s}
            {s === 'pending' && pending > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-2xl border border-border">
          <Bus className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">No requests found. Bus requests will appear here when cameras detect crowds exceeding thresholds.</p>
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
                    req.status === 'pending' ? 'bg-orange-100' : req.status === 'approved' ? 'bg-green-100' : 'bg-muted'
                  }`}>
                    <Bus className={`w-5 h-5 ${req.status === 'pending' ? 'text-orange-600' : req.status === 'approved' ? 'text-green-600' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm text-foreground">{req.route_name}</p>
                      {req.is_festival_day && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Festival</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(req.created_date), 'MMM d, h:mm a')}</span>
                      <span>{req.people_count} people · {req.buses_requested} bus(es) requested</span>
                    </div>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex-shrink-0 ${STATUS_CONFIG[req.status]?.class}`}>
                  {STATUS_CONFIG[req.status]?.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Decision Dialog */}
      {selected && (
        <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Extra Bus Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="font-medium">{selected.route_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">People Count</span><span className="font-bold text-lg">{selected.people_count}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Location</span><span className="capitalize">{selected.location?.replace('_', ' ')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Buses Requested</span><span className="font-medium">{selected.buses_requested}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Day Type</span><span>{selected.is_festival_day ? '🎉 Festival' : 'Normal'}</span></div>
              </div>
              <p className="text-sm text-muted-foreground">{selected.reason}</p>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                  disabled={selected.status !== 'pending'}
                />
              </div>
              {selected.status === 'pending' && (
                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleDecision('approved')}
                    disabled={updateRequest.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={() => handleDecision('rejected')}
                    disabled={updateRequest.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" /> Reject
                  </Button>
                </div>
              )}
              {selected.status === 'approved' && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => handleDecision('deployed')}
                  disabled={updateRequest.isPending}
                >
                  <Bus className="w-4 h-4 mr-2" /> Mark as Deployed
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}