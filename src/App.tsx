import { ReactNode, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PlayCircle, StepForward, Truck } from 'lucide-react';

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
}
