import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Accessibility, CarFront, Check, PawPrint, Search, X } from 'lucide-react';
import { CATALOG, FACTOR_BY_ID, LANES, LANE_LABELS, type Lane, type Placement, type TravelMode, type Value } from '../model';
import { FactorCard } from './FactorCard';

export function Sheet({ title, children, onClose, wide = false }: {
  title: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (active instanceof HTMLElement && active.isConnected) active.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={'board-dialog' + (wide ? ' board-dialog-wide' : '')}
    onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => { if (e.target === e.currentTarget) {
      const bounds = e.currentTarget.getBoundingClientRect();
      if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) onClose();
    } }}>
    <div className="board-dialog-header"><h2 id={titleId}>{title}</h2>
      <button type="button" className="board-icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
    </div>
    {children}
  </dialog>;
}

const quickFilters = [
  { name: 'Parking', icon: CarFront, matches: (id: string, _topic: string) => id === 'parking_space' || id === 'ev_charging' },
  { name: 'Pets', icon: PawPrint, matches: (id: string, _topic: string) => id === 'pet_allowed' },
  { name: 'Accessibility', icon: Accessibility, matches: (_id: string, topic: string) => topic === 'Access features' },
];
const topics = [...new Set(CATALOG.map(f => f.topic))];

export function FactorPicker({ placements, mode, onPick, onClose }: {
  placements: Placement[]; mode: TravelMode; onPick: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [quick, setQuick] = useState('');
  const quickFilter = quickFilters.find(item => item.name === quick);
  const search = query.trim().toLocaleLowerCase();
  const matches = CATALOG.filter(factor =>
    (!topic || factor.topic === topic) && (!quickFilter || quickFilter.matches(factor.id, factor.topic)) &&
    [factor.label, factor.topic, ...factor.options.map(({ label }) => label)].join(' ').toLocaleLowerCase().includes(search));
  return <Sheet wide title="Add a factor" onClose={onClose}>
    <div className="board-picker-controls">
      <label className="board-search"><Search size={18} /><input type="search" placeholder="Search factors"
        aria-label="Search factors" value={query} onChange={e => setQuery(e.target.value)} autoFocus /></label>
      <label className="board-topic">Topic <select value={topic} onChange={e => { setTopic(e.target.value); setQuick(''); }}>
        <option value="">All topics</option>{topics.map(t => <option key={t}>{t}</option>)}
      </select></label>
    </div>
    <div className="board-quick-filters" aria-label="Quick filters">{quickFilters.map(({ name, icon: Icon }) =>
      <button type="button" key={name} aria-pressed={quick === name} onClick={() => { setQuick(quick === name ? '' : name); setTopic(''); setQuery(''); }}>
        <Icon size={15} />{name}</button>)}</div>
    <div className="board-picker-results">
      {topics.map(t => {
        const factors = matches.filter(f => f.topic === t);
        if (!factors.length) return null;
        return <section key={t}><h3>{t}</h3><div className="board-picker-grid">{factors.map(f => {
          const placed = placements.find(p => p.id === f.id);
          return <FactorCard key={f.id} factorId={f.id} mode={mode} value={placed?.value}
            detail={placed && LANE_LABELS[placed.lane]} onOpen={() => onPick(f.id)} />;
        })}</div></section>;
      })}
      {!matches.length && <div className="board-no-results"><p>No matching factors.</p><button type="button" className="text-button"
        onClick={() => { setQuery(''); setTopic(''); setQuick(''); }}>Clear search</button></div>}
    </div>
  </Sheet>;
}

export type EditTarget = { id: string; lane?: Lane; index?: number };
export function FactorEditor({ target, placement, mode, onApply, onRemove, onClose }: {
  target: EditTarget; placement?: Placement; mode: TravelMode;
  onApply: (value: Value, lane: Lane) => void; onRemove: () => void; onClose: () => void;
}) {
  const factor = FACTOR_BY_ID.get(target.id)!;
  const [lane, setLane] = useState(target.lane ?? placement?.lane);
  const [value, setValue] = useState<Value | undefined>(placement?.value ?? (factor.options.length ? undefined : true));
  return <Sheet title={factor.label} onClose={onClose}>
    <div className="board-editor">
      {factor.options.length > 0 && <fieldset className="board-choice-set">
        <legend>{factor.id === 'commute_to_my_pin' ? 'Maximum commute by ' + mode : 'Choose a setting'}</legend>
        <div className="board-setting-choices">{factor.options.map(option => <label className="board-radio" key={String(option.value)}>
          <input type="radio" name="factor-value" checked={value === option.value} onChange={() => setValue(option.value)} />
          <span>{option.label}</span></label>)}</div>
      </fieldset>}
      <fieldset className="board-choice-set"><legend>Choose a group</legend><div className="board-lane-choices">
        {LANES.map(item => <label key={item} className={'board-radio board-radio-' + item}>
          <input type="radio" name="factor-lane" checked={lane === item} onChange={() => setLane(item)} />
          <span>{LANE_LABELS[item]}</span></label>)}</div></fieldset>
      {placement && <button type="button" className="board-remove" onClick={onRemove}>Remove from board</button>}
    </div>
    <div className="board-dialog-footer"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
      <button type="button" className="btn-primary" disabled={!lane || value === undefined}
        onClick={() => { if (lane && value !== undefined) onApply(value, lane); }}><Check size={17} />
        {placement ? 'Apply changes' : 'Add to board'}</button></div>
  </Sheet>;
}
