import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Route, Truck } from 'lucide-react';

type Priority = 'laag' | 'normaal' | 'hoog' | 'urgent';
type VehicleType = 'heftruck' | 'reachstacker' | 'terminal truck';
type Zone = 'Gate' | 'Yard A' | 'Yard B' | 'Rail' | 'Barge quay' | 'Warehouse';
type VehicleStatus = 'beschikbaar' | 'toegewezen' | 'onderweg' | 'bezig' | 'klaar';
type TaskStatus = 'open' | 'assigned' | 'active' | 'completed';

interface Task {
  id: string;
  container: string;
  from: Zone;
  to: Zone;
  priority: Priority;
  cargoType: string;
  requiredType: VehicleType;
  status: TaskStatus;
  assignedVehicleId?: string;
  createdAt: number;
  assignedAt?: number;
  acceptedAt?: number;
  completedAt?: number;
  offerExpiresAt?: number;
}

interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  status: VehicleStatus;
  location: Zone;
  currentTaskId?: string;
  eta?: number;
  utilizationMinutes: number;
}

interface LogItem { id: string; at: string; message: string; }

const zones: Zone[] = ['Gate', 'Yard A', 'Yard B', 'Rail', 'Barge quay', 'Warehouse'];
const priorityWeight: Record<Priority, number> = { laag: 1, normaal: 2, hoog: 3, urgent: 4 };

const zonePos: Record<Zone, { x: number; y: number }> = {
  Gate: { x: 8, y: 14 }, 'Yard A': { x: 32, y: 10 }, 'Yard B': { x: 58, y: 16 }, Rail: { x: 80, y: 28 }, 'Barge quay': { x: 60, y: 44 }, Warehouse: { x: 26, y: 40 }
};

const seedVehicles: Vehicle[] = [
  { id: 'v1', name: 'Heftruck 1', type: 'heftruck', status: 'beschikbaar', location: 'Yard A', utilizationMinutes: 0 },
  { id: 'v2', name: 'Heftruck 2', type: 'heftruck', status: 'beschikbaar', location: 'Warehouse', utilizationMinutes: 0 },
  { id: 'v3', name: 'Reachstacker 1', type: 'reachstacker', status: 'beschikbaar', location: 'Rail', utilizationMinutes: 0 },
  { id: 'v4', name: 'Terminal Truck 1', type: 'terminal truck', status: 'beschikbaar', location: 'Gate', utilizationMinutes: 0 }
];

const fmt = (ms?: number) => (ms ? `${Math.ceil((ms - Date.now()) / 1000)}s` : '-');
const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>(seedVehicles);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [oldMode, setOldMode] = useState(false);
  const [kpi, setKpi] = useState({ preventedDoubleTrips: 0, executedMoves: 0, totalWaitMs: 0, estimatedSavingMin: 0, oldDuplicateResponses: 0 });

  const pushLog = (message: string) => setLogs((prev) => [{ id: crypto.randomUUID(), at: new Date().toLocaleTimeString('nl-NL'), message }, ...prev].slice(0, 120));

  const zoneDistance = (a: Zone, b: Zone) => {
    const p1 = zonePos[a], p2 = zonePos[b];
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  };

  const assignTask = (task: Task, ignoreId?: string) => {
    const candidates = vehicles.filter((v) => v.type === task.requiredType && v.status === 'beschikbaar' && v.id !== ignoreId);
    if (!candidates.length) return;
    const chosen = candidates
      .map((v) => ({ v, score: zoneDistance(v.location, task.from) + v.utilizationMinutes * 0.1 - priorityWeight[task.priority] * 2 }))
      .sort((a, b) => a.score - b.score)[0].v;

    setVehicles((prev) => prev.map((v) => v.id === chosen.id ? { ...v, status: 'toegewezen', currentTaskId: task.id, eta: Date.now() + zoneDistance(v.location, task.from) * 600 } : v));
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: 'assigned', assignedVehicleId: chosen.id, assignedAt: Date.now(), offerExpiresAt: Date.now() + 30000 } : t));
    pushLog(`Taak ${task.container} toegewezen aan ${chosen.name}.`);
  };

  const createTask = (taskInput: Omit<Task, 'id'|'status'|'createdAt'>) => {
    const task: Task = { ...taskInput, id: crypto.randomUUID(), status: 'open', createdAt: Date.now() };
    setTasks((prev) => [task, ...prev]);
    pushLog(`Nieuwe taak aangemaakt: ${task.container} van ${task.from} naar ${task.to}.`);
    if (oldMode) {
      const responders = vehicles.filter((v) => v.type === task.requiredType && v.status === 'beschikbaar');
      setKpi((k) => ({ ...k, oldDuplicateResponses: k.oldDuplicateResponses + Math.max(0, responders.length - 1) }));
      pushLog(`Slechte werkwijze: taak ${task.container} naar ${responders.length} voertuigen uitgezonden.`);
      if (responders[0]) assignTask(task);
    } else {
      setKpi((k) => ({ ...k, preventedDoubleTrips: k.preventedDoubleTrips + 1 }));
      assignTask(task);
    }
  };

  const acceptTask = (vehicleId: string) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v?.currentTaskId) return;
    setVehicles((prev) => prev.map((x) => x.id === vehicleId ? { ...x, status: 'onderweg', eta: Date.now() + 12000 } : x));
    setTasks((prev) => prev.map((t) => t.id === v.currentTaskId ? { ...t, status: 'active', acceptedAt: Date.now() } : t));
    pushLog(`${v.name} heeft taak geaccepteerd en is onderweg.`);
  };

  const completeTask = (vehicleId: string) => {
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v?.currentTaskId) return;
    const task = tasks.find((t) => t.id === v.currentTaskId);
    if (!task) return;
    setVehicles((prev) => prev.map((x) => x.id === vehicleId ? { ...x, status: 'beschikbaar', currentTaskId: undefined, location: task.to, eta: undefined, utilizationMinutes: x.utilizationMinutes + 6 } : x));
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: 'completed', completedAt: Date.now() } : t));
    setKpi((k) => ({ ...k, executedMoves: k.executedMoves + 1, totalWaitMs: k.totalWaitMs + (Date.now() - task.createdAt), estimatedSavingMin: k.estimatedSavingMin + 4 }));
    pushLog(`Container ${task.container} afgeleverd op ${task.to}. Taak afgerond.`);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      const overdue = tasks.find((t) => t.status === 'assigned' && (t.offerExpiresAt ?? 0) < Date.now());
      if (overdue && overdue.assignedVehicleId) {
        const oldVehicle = vehicles.find((v) => v.id === overdue.assignedVehicleId);
        if (oldVehicle) {
          setVehicles((prev) => prev.map((v) => v.id === oldVehicle.id ? { ...v, status: 'beschikbaar', currentTaskId: undefined, eta: undefined } : v));
          pushLog(`Taak opnieuw toegewezen wegens geen reactie van ${oldVehicle.name}.`);
          assignTask({ ...overdue, status: 'open' }, oldVehicle.id);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [tasks, vehicles]);

  useEffect(() => {
    if (!simRunning) return;
    const timer = setInterval(() => {
      createTask({ container: `TMAU${Math.floor(100000 + Math.random() * 900000)}`, from: rand(zones), to: rand(zones), priority: rand(['laag', 'normaal', 'hoog', 'urgent']), cargoType: rand(['Dry', 'Reefer', 'Hazmat']), requiredType: rand(['heftruck', 'reachstacker', 'terminal truck']) });
    }, 6000);
    return () => clearInterval(timer);
  }, [simRunning, oldMode, vehicles]);

  const open = tasks.filter((t) => t.status === 'open').length;
  const active = tasks.filter((t) => t.status === 'active' || t.status === 'assigned').length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const availableVehicles = vehicles.filter((v) => v.status === 'beschikbaar').length;
  const busyVehicles = vehicles.length - availableVehicles;
  const avgWait = kpi.executedMoves ? Math.round(kpi.totalWaitMs / kpi.executedMoves / 1000) : 0;
  const utilization = Math.round((busyVehicles / vehicles.length) * 100);

  return <div className="min-h-screen bg-slate-950 text-slate-100 p-5 space-y-5">
    <h1 className="text-3xl font-bold">TMA Logistics - Slim Dispatch Demo</h1>
    <p className="text-cyan-300">Niet iedereen krijgt dezelfde opdracht. Het systeem kiest automatisch het beste voertuig en voorkomt dubbele ritten.</p>

    <Dashboard stats={{ open, active, completed, availableVehicles, busyVehicles, avgWait, utilization, ...kpi }} />
    <SimulationControls simRunning={simRunning} setSimRunning={setSimRunning} oldMode={oldMode} setOldMode={setOldMode} />
    <div className="grid lg:grid-cols-3 gap-4">
      <TaskCreator onCreate={createTask} />
      <VehiclePanel vehicles={vehicles} tasks={tasks} onAccept={acceptTask} onComplete={completeTask} />
      <TerminalMap vehicles={vehicles} tasks={tasks} />
    </div>
    <EventLog logs={logs} />
  </div>;
}

function Dashboard({ stats }: any) { const cards = [
  ['Open taken', stats.open, Clock3], ['Actieve taken', stats.active, Activity], ['Afgerond', stats.completed, CheckCircle2], ['Beschikbare voertuigen', stats.availableVehicles, Truck], ['Voertuigen bezet', stats.busyVehicles, Route]
];
  return <div className="space-y-3"><div className="grid md:grid-cols-5 gap-3">{cards.map(([t, v, I]: any) => <div key={t} className="bg-slate-900 rounded-xl p-3 border border-slate-700"><I className="w-4 h-4 text-cyan-400"/><div className="text-sm text-slate-400">{t}</div><div className="text-2xl font-semibold">{v}</div></div>)}</div>
  <div className="grid md:grid-cols-5 gap-3 text-sm">{[['Dubbele ritten voorkomen', stats.preventedDoubleTrips], ['Gem. wachttijd', `${stats.avgWait}s`], ['Moves', stats.executedMoves], ['Bezetting', `${stats.utilization}%`], ['Geschatte tijdsbesparing', `${stats.estimatedSavingMin} min`]].map(([k, v]) => <div key={String(k)} className="bg-slate-900 rounded-xl p-3 border border-slate-700"><div className="text-slate-400">{k}</div><div className="font-semibold">{v}</div></div>)}</div></div>;
}

function TaskCreator({ onCreate }: { onCreate: (input: any) => void }) { const [form, setForm] = useState({ container: '', from: 'Gate', to: 'Yard A', priority: 'normaal', cargoType: 'Dry', requiredType: 'heftruck' });
  return <div className="bg-slate-900 border border-slate-700 rounded-xl p-4"><h2 className="font-semibold mb-3">Container move aanmaken</h2><div className="space-y-2">{Object.entries(form).map(([k, v]) => <input key={k} className="w-full p-2 rounded bg-slate-800" value={String(v)} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} placeholder={k} />)}</div><button className="mt-3 px-4 py-2 bg-cyan-600 rounded" onClick={() => onCreate(form)}>Aanmaken</button></div>;
}

function VehiclePanel({ vehicles, tasks, onAccept, onComplete }: any) {
  return <div className="bg-slate-900 border border-slate-700 rounded-xl p-4"><h2 className="font-semibold mb-3">Voertuigweergave</h2><div className="space-y-2">{vehicles.map((v: Vehicle) => {
    const task = tasks.find((t: Task) => t.id === v.currentTaskId);
    return <div key={v.id} className="p-2 rounded bg-slate-800"><div className="font-medium">{v.name} <span className="text-xs text-slate-400">({v.type})</span></div><div className="text-xs">Status: <span className="text-cyan-300">{v.status}</span> | Locatie: {v.location} | ETA: {fmt(v.eta)}</div><div className="text-xs">Taak: {task ? `${task.container} ${task.from}→${task.to}` : '-'}</div><div className="flex gap-2 mt-2"><button disabled={v.status !== 'toegewezen'} className="px-2 py-1 rounded bg-emerald-600 disabled:bg-slate-700" onClick={() => onAccept(v.id)}>Accepteer</button><button disabled={v.status !== 'onderweg' && v.status !== 'bezig' && v.status !== 'toegewezen'} className="px-2 py-1 rounded bg-indigo-600 disabled:bg-slate-700" onClick={() => onComplete(v.id)}>Voltooien</button></div></div>;
  })}</div></div>;
}

function SimulationControls({ simRunning, setSimRunning, oldMode, setOldMode }: any) {
  return <div className="flex flex-wrap gap-2"><button className="px-4 py-2 rounded bg-cyan-700" onClick={() => setSimRunning((v: boolean) => !v)}>{simRunning ? 'Stop simulatie' : 'Start simulatie'}</button><button className={`px-4 py-2 rounded ${oldMode ? 'bg-rose-700' : 'bg-slate-700'}`} onClick={() => setOldMode((v: boolean) => !v)}>Slechte oude werkwijze simuleren</button></div>;
}

function TerminalMap({ vehicles, tasks }: any) {
  return <div className="bg-slate-900 border border-slate-700 rounded-xl p-4"><h2 className="font-semibold mb-3">Terminalkaart</h2><div className="relative bg-slate-800 h-72 rounded overflow-hidden">{zones.map((z) => <div key={z} className="absolute text-xs text-slate-300" style={{ left: `${zonePos[z].x}%`, top: `${zonePos[z].y}%` }}>{z}</div>)}{tasks.filter((t: Task) => t.status !== 'completed').slice(0, 8).map((t: Task) => <div key={t.id} className="absolute w-3 h-3 bg-amber-400" style={{ left: `${zonePos[t.from].x + 2}%`, top: `${zonePos[t.from].y + 3}%` }} />)}{vehicles.map((v: Vehicle) => <div key={v.id} className="absolute w-4 h-4 rounded-full bg-cyan-500 border border-white" style={{ left: `${zonePos[v.location].x}%`, top: `${zonePos[v.location].y + 5}%` }} title={v.name} />)}</div></div>;
}

function EventLog({ logs }: { logs: LogItem[] }) {
  return <div className="bg-slate-900 border border-slate-700 rounded-xl p-4"><h2 className="font-semibold mb-2">Audit trail / logboek</h2><div className="max-h-56 overflow-auto text-sm space-y-1">{logs.map((l) => <div key={l.id}><span className="text-slate-400">[{l.at}]</span> {l.message}</div>)}</div></div>;
}
