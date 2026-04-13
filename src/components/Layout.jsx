import { Outlet, Link, useLocation } from 'react-router-dom';
import { Bus, Camera, LayoutDashboard, AlertCircle, Calendar, Users, Menu, X, LogOut, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import LiveMonitor from '@/pages/LiveMonitor';
import { APP_CONFIG, BUS_STANDS } from '@/config';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { terminalsService } from '@/services/backend';
import { ModeToggle } from '@/components/mode-toggle';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/live-monitor', label: 'Live Monitor', icon: Camera },
  { path: '/requests', label: 'Bus Requests', icon: AlertCircle },
  { path: '/routes', label: 'Routes', icon: Bus },
  { path: '/festivals', label: 'Festival Days', icon: Calendar },
  { path: '/public', label: 'Public View', icon: Users },
];

export default function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  
  const { data: terminals = BUS_STANDS } = useQuery({
    queryKey: ['terminals'],
    queryFn: () => terminalsService.getTerminals(),
  });

  const [activeStandId, setActiveStandId] = useState(() => localStorage.getItem('selectedTerminal') || terminals[0]?.id || BUS_STANDS[0].id);
  const stand = terminals.find(s => s.id === activeStandId) || terminals[0] || BUS_STANDS[0];

  const handleStandChange = (id) => {
    setActiveStandId(id);
    localStorage.setItem('selectedTerminal', id);
    // Invalidate queries so child pages refetch data for the correct terminal
    queryClient.invalidateQueries();
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 top-0 bottom-0 z-50 bg-sidebar flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full w-64'} lg:w-[80px] hover:lg:w-64 group overflow-hidden whitespace-nowrap shadow-xl lg:shadow-none lg:border-r border-sidebar-border absolute lg:static`}>
        
        {/* Logo */}
        <div className="flex items-center gap-4 px-[22px] py-6 border-b border-sidebar-border">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105">
            <Bus className="w-5 h-5 text-white" />
          </div>
          <div className="opacity-100 lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 delay-75">
            <p className="text-sidebar-foreground font-bold text-base leading-tight tracking-tight uppercase">{stand.short}</p>
            <p className="text-sidebar-foreground/60 text-xs font-medium">{APP_CONFIG.system_name}</p>
          </div>
        </div>

        {/* Stand Selector */}
        <div className="px-3 py-4 border-b border-sidebar-border opacity-100 lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 overflow-hidden">
           <div className="flex items-center justify-between px-3 mb-2">
             <label className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-widest block">Switch Terminal</label>
             <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full bg-sidebar-accent/30 hover:bg-accent/30 text-sidebar-foreground/60 hover:text-accent h-0 lg:h-6 lg:opacity-100 opacity-0 transition-opacity shrink-0" asChild>
                <Link to="/terminals"><Plus className="w-3.5 h-3.5" /></Link>
             </Button>
           </div>
           <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar pr-1 pb-1">
             {terminals.map(s => (
               <button
                 key={s.id}
                 onClick={() => handleStandChange(s.id)}
                 className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all ${activeStandId === s.id ? 'bg-accent text-white font-bold' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50'}`}
               >
                 <MapPin className="w-3 h-3 flex-shrink-0" />
                 <span className="truncate">{s.city}</span>
               </button>
             ))}
           </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto overflow-x-hidden no-scrollbar">
          {navItems.map(({ path, label, icon: Icon }) => {
            const active = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-4 px-[14px] py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  active
                    ? 'bg-accent/10 text-accent font-bold shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                }`}
              >
                <div className={`flex items-center justify-center flex-shrink-0 transition-transform duration-200 ${active ? 'scale-110' : ''}`}>
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.5 : 2} />
                </div>
                <span className="opacity-100 lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 delay-75 tracking-tight">{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-sidebar-border mt-auto">
          <ModeToggle />
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full relative flex items-center justify-start h-11 px-[14px] rounded-xl text-sidebar-foreground/70 hover:text-red-500 hover:bg-red-500/10 transition-colors group/logout"
          >
            <div className="w-[22px] flex items-center justify-center flex-shrink-0 lg:mr-0 group-hover:lg:mr-4 mr-4 transition-all duration-300">
              <LogOut className="w-[20px] h-[20px] group-hover/logout:text-red-500 transition-colors" strokeWidth={2.5} />
            </div>
            <span className="opacity-100 font-semibold lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 delay-75 absolute left-12 lg:left-12">
              Secure Logout
            </span>
          </Button>
          <div className="flex items-center gap-4 px-[6px] mt-4 pt-4 border-t border-sidebar-border relative">
            <Avatar className="w-10 h-10 flex-shrink-0 border-2 border-background ring-2 ring-sidebar-border ring-offset-background transition-transform duration-300 group-hover:scale-105">
              <AvatarImage src={user?.avatar} />
              <AvatarFallback className="text-sm font-bold bg-primary/10 text-primary">
                {user?.name?.split(' ').map(n => n[0]).join('') || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 opacity-100 lg:opacity-0 group-hover:lg:opacity-100 transition-opacity duration-300 delay-75">
              <p className="text-sidebar-foreground text-sm font-bold truncate">{user?.name || 'Administrator'}</p>
              <p className="text-sidebar-foreground/60 text-[11px] font-medium truncate">{user?.email || 'admin@smartbus.gov'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-all" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-muted/20">
        {/* Top bar (mobile) */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm z-30">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Bus className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-sm tracking-tight text-foreground">{stand.name}</span>
          </div>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto no-scrollbar relative">
          <div className={location.pathname === '/live-monitor' ? 'block' : 'hidden'}>
            <LiveMonitor />
          </div>
          <div className={location.pathname !== '/live-monitor' ? 'block' : 'hidden'}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}