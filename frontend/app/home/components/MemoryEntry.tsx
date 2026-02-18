'use client';

import { useState } from 'react';
import type { MemoryEntry as MemoryEntryType, LongTermEntry, DailyEntry } from '@/lib/memory-types';

interface Props {
  entry: MemoryEntryType;
  onUpdate: (entry: MemoryEntryType, updated: LongTermEntry | DailyEntry) => void;
  onDelete: (entry: MemoryEntryType) => void;
}

export default function MemoryEntry({ entry, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit state for long-term
  const [topic, setTopic] = useState(entry.longTerm?.topic || '');
  const [details, setDetails] = useState(entry.longTerm?.details || '');

  // Edit state for daily
  const [text, setText] = useState(entry.daily?.text || '');

  const handleSave = () => {
    if (entry.type === 'long-term') {
      onUpdate(entry, { topic, details, date: entry.longTerm?.date || '' });
    } else {
      onUpdate(entry, { text });
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setTopic(entry.longTerm?.topic || '');
    setDetails(entry.longTerm?.details || '');
    setText(entry.daily?.text || '');
    setEditing(false);
  };

  const handleDelete = () => {
    onDelete(entry);
    setConfirmDelete(false);
  };

  if (editing) {
    return (
      <div className="border-b border-stone-100 px-4 py-3 dark:border-stone-800/50">
        {entry.type === 'long-term' ? (
          <div className="space-y-2">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500"
              placeholder="Topic"
            />
            <input
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-600 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:focus:border-stone-500"
              placeholder="Details"
            />
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:focus:border-stone-500"
          />
        )}
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleSave}
            className="rounded-md bg-stone-800 px-3 py-1 text-xs text-white transition hover:bg-stone-700 dark:bg-stone-200 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="rounded-md px-3 py-1 text-xs text-stone-500 transition hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3 dark:border-stone-800/50">
        <span className="text-sm text-stone-500 dark:text-stone-400">Delete this memory?</span>
        <div className="flex gap-2">
          <button
            onClick={handleDelete}
            className="rounded-md bg-red-500/10 px-3 py-1 text-xs text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="rounded-md px-3 py-1 text-xs text-stone-500 transition hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start justify-between border-b border-stone-100 px-4 py-3 transition-colors hover:bg-stone-50/50 dark:border-stone-800/50 dark:hover:bg-stone-800/30">
      <div className="min-w-0 flex-1">
        {entry.type === 'long-term' && entry.longTerm ? (
          <div>
            <span className="text-sm font-medium text-stone-800 dark:text-stone-100">
              {entry.longTerm.topic}
            </span>
            {entry.longTerm.details && (
              <span className="text-sm text-stone-500 dark:text-stone-400">
                {' '}&mdash; {entry.longTerm.details}
              </span>
            )}
            {entry.longTerm.date && (
              <span className="ml-2 inline-block rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-400 dark:bg-stone-800 dark:text-stone-500">
                {entry.longTerm.date}
              </span>
            )}
          </div>
        ) : entry.daily ? (
          <span className="text-sm text-stone-700 dark:text-stone-200">
            {entry.daily.text}
          </span>
        ) : null}
      </div>

      {/* Action buttons — visible on hover */}
      <div className="ml-3 flex flex-shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded-md p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
          aria-label="Edit"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
        </button>
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-md p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-500 dark:text-stone-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          aria-label="Delete"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </div>
    </div>
  );
}
