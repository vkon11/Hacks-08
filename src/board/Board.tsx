import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type Over,
} from '@dnd-kit/core';
import {
  ArrowDown, ArrowUp, Ban, CheckCircle2, ChevronDown, CircleMinus, GripVertical, Heart,
  Plus, SlidersHorizontal, Star, Undo2, type LucideIcon,
} from 'lucide-react';
import {
  FACTOR_BY_ID, LANES, LANE_LABELS, insertionSlot, isSoft, placeCard, removeCard, reorderCard, suggestions, toggleStar,
  type Lane, type Placement, type TravelMode, type Value,
} from '../model';
import { FactorCard } from './FactorCard';
import { FactorEditor, FactorPicker, Sheet, type EditTarget } from './BoardDialogs';
import './board.css';

const laneDetails: Record<Lane, { icon: LucideIcon; description: string }> = {
  must: { icon: CheckCircle2, description: 'I need this to be true.' },
  want: { icon: Heart, description: 'I’d prefer this.' },
  avoid: { icon: CircleMinus, description: 'I’d prefer to go without this.' },
  forbid: { icon: Ban, description: 'I’d rule out a place with this.' },
};

const detectSlot: CollisionDetection = args => {
  const pointer = args.pointerCoordinates;
  if (!pointer) return [];
  const laneHit = pointerWithin(args).find(hit => hit.data?.droppableContainer.data.current?.type === 'lane');
  if (!laneHit) return [];
  const lane = laneHit.data!.droppableContainer.data.current!.lane;
  const rows = args.droppableContainers.filter(row => row.data.current?.type === 'row' && row.data.current.lane === lane);
  rows.sort((a, b) => a.data.current!.index - b.data.current!.index);
  // Between two row midpoints the insertion line stays in the same slot.
  const row = rows.find(item => {
    const rect = args.droppableRects.get(item.id);
    return rect && pointer.y < rect.top + rect.height / 2;
  });
  return row ? [{ id: row.id }] : [laneHit];
};

function targetFromOver(over: Over | null, sourceId: string, placements: Placement[]) {
  if (!over?.data.current) return null;
  const { lane, index } = over.data.current as { lane: Lane; index: number };
  const oldIndex = placements.filter(p => p.lane === lane).findIndex(p => p.id === sourceId);
  return { id: sourceId, lane, index: index - (oldIndex !== -1 && oldIndex < index ? 1 : 0) };
}

function markInsertion(target: EditTarget | null, placements: Placement[]) {
  if (!target?.lane || target.index === undefined) return null;
  const source = placements.find(p => p.id === target.id);
  const rows = placements.filter(p => p.lane === target.lane);
  const rest = rows.filter(p => p.id !== target.id);
  const starred = Boolean(source?.starred && isSoft(target.lane));
  const index = insertionSlot(rest, starred, target.index);
  const next = rest[index];
  return { lane: target.lane, index: next ? rows.findIndex(p => p.id === next.id) : rows.length };
}

function DraggableCard({ id, value, mode, onOpen, buttonId, actions }: {
  id: string; value?: Value; mode: TravelMode; onOpen: () => void; buttonId: string; actions?: ReactNode;
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, isDragging } = useDraggable({ id });
  return <div ref={setNodeRef} className={'board-draggable' + (isDragging ? ' board-dragging' : '')}>
    <FactorCard factorId={id} value={value} mode={mode} onOpen={onOpen} buttonId={buttonId} actions={actions}
      handle={<button type="button" className="board-drag-handle" ref={setActivatorNodeRef} {...listeners}
        tabIndex={-1} title={'Drag ' + FACTOR_BY_ID.get(id)?.label}
        aria-label={'Drag ' + FACTOR_BY_ID.get(id)?.label} onClick={onOpen}><GripVertical size={18} /></button>} />
  </div>;
}

function BoardRow({ placement, index, children }: { placement: Placement; index: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: 'row-' + placement.id, data: { type: 'row', lane: placement.lane, index } });
  return <li ref={setNodeRef} className="board-row">{children}</li>;
}

function LanePanel({ lane, rows, mark, onAdd, renderCard }: {
  lane: Lane; rows: Placement[]; mark: number | undefined; onAdd: () => void; renderCard: (p: Placement) => ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: 'lane-' + lane, data: { type: 'lane', lane, index: rows.length } });
  const { icon: Icon, description } = laneDetails[lane];
  return <section ref={setNodeRef} className={'board-lane board-lane-' + lane + (mark !== undefined ? ' board-lane-target' : '')}
    aria-labelledby={'lane-title-' + lane}>
    <div className="board-lane-heading"><span className="board-lane-icon"><Icon size={19} /></span>
      <h2 id={'lane-title-' + lane}>{LANE_LABELS[lane]}</h2><span className="board-count" aria-label={rows.length + ' factors'}>{rows.length}</span>
    </div>
    <p className="board-lane-description">{description}</p>
    {rows.length ? <ol className="board-rows">{rows.map((p, index) => <BoardRow key={p.id} placement={p} index={index}>
      {index === 0 && p.starred && <div className="board-strength"><Star size={13} />Strong preference</div>}
      {index > 0 && rows[index - 1].starred && !p.starred && <div className="board-strength">Other preferences</div>}
      {mark === index && <div className="board-insert" aria-hidden="true" />}
      {renderCard(p)}
    </BoardRow>)}</ol> : <button type="button" className="board-empty" onClick={onAdd} aria-label={'Add a factor to ' + LANE_LABELS[lane]}>
      <Plus size={17} />Add or drop a factor</button>}
    {mark === rows.length && <div className="board-insert" aria-hidden="true" />}
  </section>;
}

type BoardProps = {
  placements: Placement[]; mode: TravelMode; onChange: (placements: Placement[]) => void; onSave: () => void;
};

export default function Board({ placements, mode, onChange, onSave }: BoardProps) {
  const [picker, setPicker] = useState<{ lane?: Lane } | null>(null);
  const [editor, setEditor] = useState<EditTarget | null>(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [previous, setPrevious] = useState<{ rows: Placement[]; id: string } | null>(null);
  const [message, setMessage] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<EditTarget | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const pendingDrop = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(pendingDrop.current), []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const tray = suggestions(mode);
  const mark = markInsertion(dropTarget ?? editor, placements);
  const focusFactor = (id: string) => requestAnimationFrame(() => {
    const button = document.getElementById('board-card-' + id) ?? document.getElementById('board-tray-' + id) ?? addButton.current;
    button?.focus({ preventScroll: true });
  });
  function commit(next: Placement[], id: string, announcement?: string) {
    const changed = next.length !== placements.length || next.some((p, i) => {
      const old = placements[i];
      return p.id !== old.id || p.value !== old.value || p.lane !== old.lane || p.starred !== old.starred;
    });
    if (changed) {
      setPrevious({ rows: placements, id });
      onChange(next);
      const placed = next.find(p => p.id === id);
      const peers = next.filter(p => p.lane === placed?.lane);
      const label = FACTOR_BY_ID.get(id)!.label;
      setMessage(announcement ?? (placed
        ? label + ' moved to ' + LANE_LABELS[placed.lane] + ', position ' + (peers.indexOf(placed) + 1) + ' of ' + peers.length + '.'
        : label + ' removed from board.'));
    }
    focusFactor(id);
  }
  function openEditor(id: string, lane?: Lane) {
    setEditor({ id, lane: placements.find(p => p.id === id)?.lane ?? lane });
  }
  function finishDrop(event: DragEndEvent) {
    const id = String(event.active.id);
    const target = targetFromOver(event.over, id, placements);
    setActiveId(null);
    if (!target) {
      setDropTarget(null);
      return;
    }
    // dnd-kit's PointerSensor captures document clicks for 50 ms after release.
    // Keep the insertion line until the newly placed card or preset dialog can accept input.
    clearTimeout(pendingDrop.current);
    pendingDrop.current = setTimeout(() => {
      setDropTarget(null);
      const placed = placements.find(p => p.id === id);
      if (!placed && FACTOR_BY_ID.get(id)!.options.length) setEditor(target);
      else commit(placeCard(placements, id, placed?.value ?? true, target.lane, target.index), id);
    }, 55);
  }
  function closeEditor() {
    setEditor(null);
    setPicker(null);
  }
  function renderPlaced(p: Placement) {
    const group = placements.filter(item => item.lane === p.lane && item.starred === p.starred);
    const index = group.indexOf(p);
    const label = FACTOR_BY_ID.get(p.id)!.label;
    const actions = <>
      <button type="button" className="board-move" aria-label={'Move ' + label} onClick={() => openEditor(p.id)}><SlidersHorizontal size={14} />Move</button>
      {isSoft(p.lane) && <button type="button" className="board-row-action board-star" aria-label={'Strong preference for ' + label}
        title="Strong preference" aria-pressed={p.starred} onClick={() => commit(toggleStar(placements, p.id), p.id,
          label + (p.starred ? ' returned to ordinary priority.' : ' marked as a strong preference.'))}><Star size={17} /></button>}
      <button type="button" className="board-row-action" aria-label={'Move ' + label + ' up'} title="Move up" disabled={index === 0}
        onClick={() => commit(reorderCard(placements, p.id, -1), p.id)}><ArrowUp size={17} /></button>
      <button type="button" className="board-row-action" aria-label={'Move ' + label + ' down'} title="Move down" disabled={index === group.length - 1}
        onClick={() => commit(reorderCard(placements, p.id, 1), p.id)}><ArrowDown size={17} /></button>
    </>;
    return <DraggableCard id={p.id} value={p.value} mode={mode} onOpen={() => openEditor(p.id)} buttonId={'board-card-' + p.id} actions={actions} />;
  }
  return <div className="priority-board">
    <DndContext sensors={sensors} collisionDetection={detectSlot} onDragStart={event => setActiveId(String(event.active.id))}
      onDragOver={event => setDropTarget(targetFromOver(event.over, String(event.active.id), placements))}
      onDragCancel={() => { setActiveId(null); setDropTarget(null); }} onDragEnd={finishDrop}>
      <div className="board-layout">
        <aside className="board-tray" aria-label="Suggested factors"><div className="board-tray-header"><h2>Suggested factors</h2>
          <button type="button" className="board-picker-opener" ref={addButton} onClick={() => setPicker({})}><Plus size={16} />Add a factor</button></div>
          <div className={'board-tray-list' + (showAll ? ' board-tray-expanded' : '')}>{tray.map(f => {
            const p = placements.find(p => p.id === f.id);
            return p
              ? <FactorCard key={f.id} factorId={f.id} value={p.value} mode={mode} detail={LANE_LABELS[p.lane]}
                buttonId={'board-tray-' + f.id} onOpen={() => openEditor(f.id)} />
              : <DraggableCard key={f.id} id={f.id} mode={mode} buttonId={'board-tray-' + f.id} onOpen={() => openEditor(f.id)} />;
          })}</div>
          <button type="button" className="board-more-suggestions" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer suggestions' : 'Show all ' + tray.length + ' suggestions'}<ChevronDown size={15} /></button>
        </aside>
        <div className="board-lanes">{LANES.map(lane => <LanePanel key={lane} lane={lane} rows={placements.filter(p => p.lane === lane)}
          mark={mark?.lane === lane ? mark.index : undefined} onAdd={() => setPicker({ lane })} renderCard={renderPlaced} />)}</div>
      </div>
      <DragOverlay dropAnimation={null}>{activeId && <div className="board-overlay"><FactorCard factorId={activeId} mode={mode}
        value={placements.find(p => p.id === activeId)?.value} /></div>}</DragOverlay>
    </DndContext>
    <div className="board-footer">
      <button type="button" className="board-undo" disabled={!previous} onClick={() => {
        if (!previous) return;
        onChange(previous.rows); setPrevious(null); setMessage('Last board change undone.'); focusFactor(previous.id);
      }}><Undo2 size={17} />Undo</button>
      <button type="button" className="btn-primary" onClick={() => placements.length ? onSave() : setConfirmEmpty(true)}>Save my priorities</button>
    </div>
    <p className="board-sr-only" role="status">{message}</p>
    {picker && <FactorPicker placements={placements} mode={mode} onPick={id => openEditor(id, picker.lane)} onClose={() => setPicker(null)} />}
    {editor && <FactorEditor key={editor.id} target={editor} placement={placements.find(p => p.id === editor.id)} mode={mode}
      onClose={() => setEditor(null)} onApply={(value, lane) => {
        commit(placeCard(placements, editor.id, value, lane, editor.lane === lane ? editor.index : undefined), editor.id);
        closeEditor();
      }} onRemove={() => { commit(removeCard(placements, editor.id), editor.id); closeEditor(); }} />}
    {confirmEmpty && <Sheet title="Save without any extra priorities?" onClose={() => setConfirmEmpty(false)}>
      <div className="board-dialog-footer"><button type="button" className="btn-secondary" onClick={() => setConfirmEmpty(false)}>Keep sorting</button>
        <button type="button" className="btn-primary" onClick={() => { setConfirmEmpty(false); onSave(); }}>Save these preferences</button></div></Sheet>}
  </div>;
}
