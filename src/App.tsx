// Merge-conflict safe version: unified around the interactive map-first demo flow.
import { ReactNode, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PlayCircle, StepForward, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Route, Truck } from 'lucide-react';

type Priority = 'laag' | 'normaal' | 'hoog' | 'urgent';
type VehicleType = 'heftruck' | 'reachstacker' | 'terminal truck';
type Zone = 'Gate' | 'Yard A' | 'Yard B' | 'Rail' | 'Barge quay' | 'Warehouse';
type VehicleStatus = 'beschikbaar' | 'toegewezen' | 'onderweg-container' | 'onderweg-bestemming' | 'afgerond';
type DemoPhase = 'idle' | 'created' | 'assigned' | 'accepted' | 'toContainer' | 'toDestination' | 'completed';

interface Vehicle {
  id: string;
  name: string;
  type: VehicleType;
  zone: Zone;
  status: VehicleStatus;
  assignedTaskId?: string;
  progress: number;
}

interface Task {
  id: string;
  containerNumber: string;
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
  status: 'new' | 'assigned' | 'accepted' | 'moving_to_container' | 'moving_to_destination' | 'completed';
  assignedVehicleId?: string;
}

interface ContainerVisual {
  id: string;
  label: string;
  zone: Zone;
  taskId: string;
  attachedToVehicleId?: string;
}

const zonePos: Record<Zone, { x: number; y: number; w: number; h: number }> = {
  Gate: { x: 20, y: 20, w: 150, h: 90 },
  'Yard A': { x: 210, y: 20, w: 180, h: 90 },
  'Yard B': { x: 430, y: 20, w: 180, h: 90 },
  Rail: { x: 640, y: 20, w: 160, h: 90 },
  'Barge quay': { x: 470, y: 170, w: 230, h: 90 },
  Warehouse: { x: 170, y: 170, w: 250, h: 90 }
};

const vehicleStart: Vehicle[] = [
  { id: 'v1', name: 'Heftruck 1', type: 'heftruck', zone: 'Yard A', status: 'beschikbaar', progress: 0 },
  { id: 'v2', name: 'Heftruck 2', type: 'heftruck', zone: 'Warehouse', status: 'beschikbaar', progress: 0 },
  { id: 'v3', name: 'Reachstacker 1', type: 'reachstacker', zone: 'Rail', status: 'beschikbaar', progress: 0 },
  { id: 'v4', name: 'Terminal Truck 1', type: 'terminal truck', zone: 'Gate', status: 'beschikbaar', progress: 0 }
];

const phaseText: Record<DemoPhase, string> = {
  idle: 'Klaar voor nieuwe demo.',
  created: '1) Move aangemaakt. Container staat klaar op de kaart.',
  assigned: '2) Slimme toewijzing: exact één voertuig geselecteerd.',
  accepted: '3) Chauffeur accepteert de taak.',
  toContainer: '4) Voertuig rijdt naar de container.',
  toDestination: '5) Container is opgepakt en rijdt naar bestemming.',
  completed: '6) Move afgerond: container en voertuig op eindpositie.'
};

const distance = (a: Zone, b: Zone) => {
  const p1 = zonePos[a], p2 = zonePos[b];
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
};

const defaultForm = {
  containerNumber: 'TMAU1234567',
  from: 'Gate' as Zone,
  to: 'Yard B' as Zone,
  priority: 'hoog' as Priority,
  cargoType: 'Dry',
  requiredType: 'heftruck' as VehicleType
};

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>(vehicleStart);
  const [task, setTask] = useState<Task | null>(null);
  const [container, setContainer] = useState<ContainerVisual | null>(null);
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [oldMode, setOldMode] = useState(false);
  const [oldModeExtraTrips, setOldModeExtraTrips] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [form, setForm] = useState(defaultForm);

  const pushLog = (m: string) => setLogs((prev) => [`${new Date().toLocaleTimeString('nl-NL')} - ${m}`, ...prev].slice(0, 40));

  /** Dispatchinglogica: kies exact één voertuig op type, beschikbaarheid en kortste afstand. */
  const pickBestVehicle = (draftTask: Task): Vehicle | undefined => {
    const candidates = vehicles.filter((v) => v.type === draftTask.requiredType && v.status === 'beschikbaar');
    return candidates.sort((a, b) => distance(a.zone, draftTask.from) - distance(b.zone, draftTask.from))[0];
  };

  const createMove = () => {
    const newTask: Task = {
      id: crypto.randomUUID(),
      ...form,
      status: 'new'
    };
    setTask(newTask);
    setContainer({ id: `c-${newTask.id}`, label: newTask.containerNumber, zone: newTask.from, taskId: newTask.id });
    setPhase('created');
    pushLog(`Nieuwe taak aangemaakt: ${newTask.containerNumber} (${newTask.from} → ${newTask.to}).`);
  };

  const assignSmart = () => {
    if (!task || phase === 'idle') return;
    const best = pickBestVehicle(task);
    if (!best) return pushLog('Geen geschikt voertuig beschikbaar.');
    setVehicles((prev) => prev.map((v) => (v.id === best.id ? { ...v, status: 'toegewezen', assignedTaskId: task.id } : v)));
    setTask({ ...task, status: 'assigned', assignedVehicleId: best.id });
    setPhase('assigned');
    setOldMode(false);
    pushLog(`Slim toegewezen aan ${best.name}. Alleen dit voertuig krijgt de opdracht.`);
  };

  const simulateOld = () => {
    if (!task) return;
    const responders = vehicles.filter((v) => v.type === task.requiredType);
    setOldModeExtraTrips(Math.max(0, responders.length - 1));
    setOldMode(true);
    setPhase('assigned');
    pushLog(`Oude werkwijze: opdracht naar ${responders.length} voertuigen gestuurd (onnodige ritten zichtbaar in rood).`);
  };

  const acceptTask = () => {
    if (!task?.assignedVehicleId) return;
    setVehicles((prev) => prev.map((v) => (v.id === task.assignedVehicleId ? { ...v, status: 'onderweg-container', progress: 0 } : v)));
    setTask({ ...task, status: 'accepted' });
    setPhase('accepted');
    pushLog('Chauffeur heeft taak geaccepteerd.');
  };

  const startMove = () => {
    if (!task?.assignedVehicleId || !container) return;
    setPhase('toContainer');
    setTask({ ...task, status: 'moving_to_container' });
    pushLog('Voertuig rijdt naar container.');

    let p = 0;
    const t = setInterval(() => {
      p += 10;
      setVehicles((prev) => prev.map((v) => (v.id === task.assignedVehicleId ? { ...v, progress: Math.min(100, p) } : v)));
      if (p >= 100) {
        clearInterval(t);
        setContainer({ ...container, attachedToVehicleId: task.assignedVehicleId });
        setTask((prev) => (prev ? { ...prev, status: 'moving_to_destination' } : prev));
        setPhase('toDestination');
        pushLog('Container opgepakt. Rit naar bestemming gestart.');
        animateToDestination();
      }
    }, 180);
  };

  /** Kaartlogica: animatie van voertuig + container naar eindzone met realtime progress updates. */
  const animateToDestination = () => {
    if (!task?.assignedVehicleId) return;
    let p = 0;
    const t = setInterval(() => {
      p += 8;
      setVehicles((prev) => prev.map((v) => (v.id === task.assignedVehicleId ? { ...v, status: 'onderweg-bestemming', progress: Math.min(100, p) } : v)));
      if (p >= 100) {
        clearInterval(t);
        setVehicles((prev) => prev.map((v) => (v.id === task.assignedVehicleId ? { ...v, status: 'afgerond', zone: task.to, progress: 100 } : { ...v, progress: 0 })));
        setContainer((prev) => (prev ? { ...prev, zone: task.to, attachedToVehicleId: undefined } : prev));
        setTask((prev) => (prev ? { ...prev, status: 'completed' } : prev));
        setPhase('completed');
        pushLog('Container afgeleverd. Taak afgerond.');
      }
    }, 180);
  };

  const resetDemo = () => {
    setVehicles(vehicleStart);
    setTask(null);
    setContainer(null);
    setPhase('idle');
    setOldMode(false);
    setOldModeExtraTrips(0);
    setAutoPlaying(false);
  };

  const currentVehicle = useMemo(() => vehicles.find((v) => v.id === task?.assignedVehicleId), [vehicles, task]);

  const getPoint = (zone: Zone) => ({ x: zonePos[zone].x + zonePos[zone].w / 2, y: zonePos[zone].y + zonePos[zone].h / 2 });
  const vehiclePoint = (v: Vehicle) => {
    if (!task) return getPoint(v.zone);
    const from = getPoint(v.zone);
    const toContainer = getPoint(task.from);
    const toDest = getPoint(task.to);
    if (v.assignedTaskId !== task.id) return from;
    if (v.status === 'onderweg-container') return { x: from.x + (toContainer.x - from.x) * (v.progress / 100), y: from.y + (toContainer.y - from.y) * (v.progress / 100) };
    if (v.status === 'onderweg-bestemming') return { x: toContainer.x + (toDest.x - toContainer.x) * (v.progress / 100), y: toContainer.y + (toDest.y - toContainer.y) * (v.progress / 100) };
    if (v.status === 'afgerond') return toDest;
    return from;
  };

  const playAutoDemo = async () => {
    if (autoPlaying) return;
    resetDemo();
    setAutoPlaying(true);
    setTimeout(() => createMove(), 400);
    setTimeout(() => assignSmart(), 1200);
    setTimeout(() => acceptTask(), 1800);
    setTimeout(() => startMove(), 2300);
    setTimeout(() => setAutoPlaying(false), 8000);
  };

  const stepDemo = () => {
    if (phase === 'idle') return createMove();
    if (phase === 'created') return assignSmart();
    if (phase === 'assigned') return acceptTask();
    if (phase === 'accepted') return startMove();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 space-y-4">
      <h1 className="text-2xl lg:text-3xl font-bold">TMA Logistics Dispatch Demo</h1>
      <p className="text-cyan-300">Oude situatie: opdracht naar iedereen. Nieuwe situatie: één slim gekozen voertuig.</p>

      <div className="grid lg:grid-cols-12 gap-4">
        <section className="lg:col-span-8 bg-slate-900 rounded-xl border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-lg">Werkende terminalkaart (centraal)</h2>
            {oldMode ? <div className="text-red-300 text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Onnodige ritten: {oldModeExtraTrips}</div> : null}
          </div>
          <TerminalMap vehicles={vehicles} task={task} container={container} oldMode={oldMode} vehiclePoint={vehiclePoint} getPoint={getPoint} />
          <div className="mt-3 p-3 rounded bg-slate-800 text-sm"><strong>Wat gebeurt hier?</strong> {phaseText[phase]}</div>
          <StepBar phase={phase} />
        </section>

        <section className="lg:col-span-4 space-y-3">
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-2">
            <h3 className="font-semibold">1. Maak container move</h3>
            <input className="w-full bg-slate-800 rounded p-2" value={form.containerNumber} onChange={(e) => setForm((f) => ({ ...f, containerNumber: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <select className="bg-slate-800 rounded p-2" value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value as Zone }))}>{Object.keys(zonePos).map((z) => <option key={z}>{z}</option>)}</select>
              <select className="bg-slate-800 rounded p-2" value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value as Zone }))}>{Object.keys(zonePos).map((z) => <option key={z}>{z}</option>)}</select>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <select className="bg-slate-800 rounded p-2" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}><option>laag</option><option>normaal</option><option>hoog</option><option>urgent</option></select>
              <select className="bg-slate-800 rounded p-2" value={form.requiredType} onChange={(e) => setForm((f) => ({ ...f, requiredType: e.target.value as VehicleType }))}><option>heftruck</option><option>reachstacker</option><option>terminal truck</option></select>
            </div>
            <input className="w-full bg-slate-800 rounded p-2 text-sm" value={form.cargoType} onChange={(e) => setForm((f) => ({ ...f, cargoType: e.target.value }))} placeholder="Ladingtype" />
            <button className="w-full bg-cyan-700 hover:bg-cyan-600 rounded p-2" onClick={createMove}>1. Maak container move</button>
            <button className="w-full bg-blue-700 hover:bg-blue-600 rounded p-2" onClick={assignSmart}>2. Slim toewijzen</button>
            <button className="w-full bg-orange-700 hover:bg-orange-600 rounded p-2" onClick={acceptTask}>3. Accepteer taak</button>
            <button className="w-full bg-emerald-700 hover:bg-emerald-600 rounded p-2" onClick={startMove}>4. Start verplaatsing / Rond move af</button>
            <button className="w-full bg-red-700 hover:bg-red-600 rounded p-2" onClick={simulateOld}>Simuleer oude werkwijze</button>
          </div>

          <div className="bg-slate-900 rounded-xl border border-slate-700 p-4 space-y-2">
            <h3 className="font-semibold">Demo controls</h3>
            <button className="w-full bg-indigo-700 rounded p-2 flex items-center justify-center gap-2" onClick={playAutoDemo}><PlayCircle className="w-4 h-4"/>Speel demo automatisch af</button>
            <button className="w-full bg-violet-700 rounded p-2 flex items-center justify-center gap-2" onClick={stepDemo}><StepForward className="w-4 h-4"/>Stap voor stap demo</button>
            <button className="w-full bg-slate-700 rounded p-2" onClick={resetDemo}>Reset</button>
          </div>
        </section>
      </div>

      <section className="grid lg:grid-cols-3 gap-4">
        <KpiCard title="Status" value={task?.status ?? 'geen taak'} icon={<CheckCircle2 className="w-4 h-4" />} color="text-blue-300" />
        <KpiCard title="Gekozen voertuig" value={currentVehicle?.name ?? '-'} icon={<Truck className="w-4 h-4" />} color="text-green-300" />
        <KpiCard title="ETA/progress" value={currentVehicle ? `${Math.round(currentVehicle.progress)}%` : '-'} icon={<PlayCircle className="w-4 h-4" />} color="text-orange-300" />
      </section>

      <section className="bg-slate-900 rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold mb-2">Audit trail / logboek</h3>
        <div className="max-h-52 overflow-auto text-sm space-y-1">{logs.map((l, i) => <div key={i}>{l}</div>)}</div>
      </section>
    </div>
  );
}

function StepBar({ phase }: { phase: DemoPhase }) {
  const steps: { key: DemoPhase; label: string }[] = [
    { key: 'created', label: '1. Move aangemaakt' },
    { key: 'assigned', label: '2. Voertuig gekozen' },
    { key: 'accepted', label: '3. Geaccepteerd' },
    { key: 'toContainer', label: '4. Onderweg' },
    { key: 'completed', label: '5. Afgeleverd' }
  ];
  const order: DemoPhase[] = ['idle', 'created', 'assigned', 'accepted', 'toContainer', 'toDestination', 'completed'];
  const idx = order.indexOf(phase);
  return <div className="mt-3 grid md:grid-cols-5 gap-2 text-xs">{steps.map((s) => <div key={s.key} className={`rounded p-2 border ${order.indexOf(s.key) <= idx ? 'bg-cyan-900/40 border-cyan-500 text-cyan-200' : 'bg-slate-800 border-slate-600 text-slate-300'}`}>{s.label}</div>)}</div>;
}

function KpiCard({ title, value, icon, color }: { title: string; value: string; icon: ReactNode; color: string }) {
  return <div className="bg-slate-900 rounded-xl border border-slate-700 p-4"><div className={`flex items-center gap-2 ${color}`}>{icon}<span className="text-sm">{title}</span></div><div className="text-xl font-semibold mt-1">{value}</div></div>;
}

function TerminalMap({ vehicles, task, container, oldMode, vehiclePoint, getPoint }: any) {
  const assigned = task?.assignedVehicleId;
  const selectedVehicle = vehicles.find((v: Vehicle) => v.id === assigned);
  return (
    <svg viewBox="0 0 840 300" className="w-full h-[360px] bg-slate-800 rounded border border-slate-700">
      {Object.entries(zonePos).map(([name, z]) => (
        <g key={name}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="10" fill="#0f172a" stroke="#334155" />
          <text x={z.x + 10} y={z.y + 20} fill="#cbd5e1" fontSize="13">{name}</text>
        </g>
      ))}

      {task && container ? <circle cx={getPoint(task.from).x} cy={getPoint(task.from).y} r="22" fill="none" stroke="#f59e0b" strokeWidth="3" /> : null}
      {task && container ? <rect x={getPoint(container.attachedToVehicleId ? task.to : container.zone).x - 12} y={getPoint(container.attachedToVehicleId ? task.to : container.zone).y - 12} width="24" height="24" fill="#fbbf24" rx="4" /> : null}
      {task && container ? <text x={getPoint(container.zone).x + 14} y={getPoint(container.zone).y + 4} fill="#fde68a" fontSize="11">{container.label}</text> : null}

      {task && selectedVehicle ? (
        <line x1={vehiclePoint(selectedVehicle).x} y1={vehiclePoint(selectedVehicle).y} x2={getPoint(task.from).x} y2={getPoint(task.from).y} stroke="#3b82f6" strokeWidth="3" strokeDasharray="7 5" />
      ) : null}

      {oldMode && task ? vehicles.filter((v: Vehicle) => v.type === task.requiredType).map((v: Vehicle) => {
        const p = vehiclePoint(v);
        const c = getPoint(task.from);
        return <line key={v.id} x1={p.x} y1={p.y} x2={c.x} y2={c.y} stroke="#ef4444" strokeWidth="2" strokeDasharray="5 5" />;
      }) : null}

      {vehicles.map((v: Vehicle) => {
        const p = vehiclePoint(v);
        const color = v.id === assigned ? '#38bdf8' : '#22c55e';
        return (
          <g key={v.id}>
            <circle cx={p.x} cy={p.y} r="11" fill={color} />
            <text x={p.x + 14} y={p.y + 4} fill="#e2e8f0" fontSize="11">{v.name}</text>
          </g>
        );
      })}
    </svg>
  );
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
