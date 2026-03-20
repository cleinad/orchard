'use client';

import { useState } from 'react';
import type { MemoryItem, MemoryItemUpdateInput } from '@/lib/memory-items';

interface Props {
  entry: MemoryItem;
  onUpdate: (entry: MemoryItem, updated: MemoryItemUpdateInput) => void;
  onDelete: (entry: MemoryItem) => void;
}

export default function MemoryEntry({ entry, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [text, setText] = useState(entry.text);
  const [type, setType] = useState(entry.type);
  const [stability, setStability] = useState(entry.stability);
  const [salience, setSalience] = useState(entry.salience);

  const handleSave = () => {
    const patch: MemoryItemUpdateInput = {
      text: text.trim(),
      type: type.trim(),
      stability,
      salience,
    };

    onUpdate(entry, patch);
    setEditing(false);
  };

  const handleCancel = () => {
    setText(entry.text);
    setType(entry.type);
    setStability(entry.stability);
    setSalience(entry.salience);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="border-b border-border-subtle px-4 py-3">
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/[0.14]"
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground/[0.14]"
              placeholder="Type"
            />

            <select
              value={stability}
              onChange={(event) =>
                setStability(event.target.value as MemoryItem['stability'])
              }
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-sm text-foreground outline-none focus:border-foreground/[0.14]"
            >
              <option value="stable">Stable</option>
              <option value="episodic">Episodic</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted">
              Salience: {salience}
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={salience}
              onChange={(event) => setSalience(Number(event.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <button
            onClick={handleSave}
            className="rounded-md bg-foreground px-3 py-1 text-xs text-background transition hover:opacity-80"
            disabled={!text.trim() || !type.trim()}
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md px-3 py-1 text-xs text-muted transition hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <span className="text-sm text-muted">Delete this memory?</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              onDelete(entry);
              setConfirmDelete(false);
            }}
            className="rounded-md bg-red-500/10 px-3 py-1 text-xs text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-md px-3 py-1 text-xs text-muted transition hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group border-b border-border-subtle px-4 py-3 transition-colors hover:bg-foreground/[0.03]">
      <p className="text-sm text-foreground/88">{entry.text}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide">
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-muted">
          {entry.owner_type}
        </span>
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-muted">
          {entry.type}
        </span>
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-muted">
          {entry.stability}
        </span>
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-muted">
          salience {entry.salience}
        </span>
        <span className="rounded-full bg-foreground/[0.05] px-2 py-0.5 text-muted">
          confidence {entry.confidence.toFixed(2)}
        </span>
      </div>

      <div className="mt-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md p-1.5 text-muted transition hover:bg-foreground/[0.05] hover:text-foreground"
          aria-label="Edit"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
            />
          </svg>
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-md p-1.5 text-muted transition hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400"
          aria-label="Delete"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
