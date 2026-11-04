"use client";

import { useId, useState, type ReactNode } from "react";
import { CalendarIcon, ColumnsIcon, TableIcon } from "@primer/octicons-react";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";

export type BoardItem = { id: string; content: ReactNode };
export type BoardColumn = { id: string; title: string; items: BoardItem[] };

function DraggableCard({ item }: { item: BoardItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={`cursor-grab touch-none rounded border border-border bg-background p-3 active:cursor-grabbing ${isDragging ? "opacity-50" : ""}`}
    >
      {item.content}
    </div>
  );
}

function BoardLane({ column }: { column: BoardColumn }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id });
  return (
    <section ref={setNodeRef} className={`min-h-36 rounded-md border border-border bg-card p-3 ${isOver ? "ring-2 ring-ring" : ""}`}>
      <h3 className="mb-3 font-semibold">{column.title}</h3>
      <div className="space-y-2">{column.items.map((item) => <DraggableCard key={item.id} item={item} />)}</div>
    </section>
  );
}

export function BoardView({ columns: initialColumns, onMove }: { columns: BoardColumn[]; onMove?: (itemId: string, columnId: string) => void }) {
  const id = useId();
  const [columns, setColumns] = useState(initialColumns);
  function moveItem(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const destination = columns.find((column) => column.id === String(over.id) || column.items.some((item) => item.id === String(over.id)));
    const source = columns.find((column) => column.items.some((item) => item.id === itemId));
    if (!source || !destination || source.id === destination.id) return;
    onMove?.(itemId, destination.id);
    setColumns((current) => {
      const item = current.flatMap((column) => column.items).find((candidate) => candidate.id === itemId);
      if (!item) return current;
      return current.map((column) => ({
        ...column,
        items: column.id === source.id
          ? column.items.filter((candidate) => candidate.id !== itemId)
          : column.id === destination.id
            ? [...column.items, item]
            : column.items,
      }));
    });
  }
  return <DndContext id={id} onDragEnd={moveItem}><div className="grid grid-cols-1 gap-3 md:grid-cols-3">{columns.map((column) => <BoardLane key={column.id} column={column} />)}</div></DndContext>;
}

export function TableView({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto rounded-md border border-border"><table className="w-full text-left">{children}</table></div>;
}

export function EditableCell({ value, onSave }: { value: string; onSave?: (value: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  function save() {
    setEditing(false);
    if (draft !== value) onSave?.(draft);
  }
  return (
    <td className="border-t border-border p-3">
      {editing
        ? <input aria-label="Edit cell" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => { if (event.key === "Enter") save(); if (event.key === "Escape") { setDraft(value); setEditing(false); } }} className="w-full rounded border border-input bg-background px-2 py-1" />
        : <button type="button" className="min-h-6 text-left" onClick={() => setEditing(true)}>{value}</button>}
    </td>
  );
}

export function CalendarView({ month = new Date() }: { month?: Date }) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return <section aria-label={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}><h3 className="mb-3 font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3><div className="grid grid-cols-7 overflow-hidden rounded-md border border-border">{Array.from({ length: days + start.getDay() }, (_, index) => <div key={index} className="min-h-20 border-b border-r border-border p-2 text-xs">{index >= start.getDay() ? index - start.getDay() + 1 : ""}</div>)}</div></section>;
}

export function SplitView({ main, panel }: { main: ReactNode; panel: ReactNode }) {
  return <div className="flex min-h-96 gap-3"><div className="min-w-0 flex-1">{main}</div><aside className="w-80 shrink-0 resize-x overflow-auto rounded-md border border-border bg-card p-4">{panel}</aside></div>;
}

export const ViewIcons = { board: ColumnsIcon, table: TableIcon, calendar: CalendarIcon };
