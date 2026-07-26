/**
 * Chainable mock Supabase client for testing.
 *
 * Usage:
 *   const { client, tracker } = createMockSupabase({ memory_items: [...] });
 *   // ...call code under test...
 *   expect(tracker.inserts('memory_items')).toHaveLength(1);
 */

type MockRow = object;

interface MutationRecord {
  table: string;
  operation: 'insert' | 'update' | 'upsert' | 'delete';
  args: unknown;
  filters: Record<string, unknown>;
}

interface QueryRecord {
  table: string;
  operation: 'select';
  args: unknown;
  filters: Record<string, unknown>;
}

interface RpcRecord {
  fn: string;
  args: unknown;
}

export interface MutationTracker {
  mutations: MutationRecord[];
  queries: QueryRecord[];
  rpcs: RpcRecord[];
  inserts: (table: string) => MutationRecord[];
  updates: (table: string) => MutationRecord[];
  upserts: (table: string) => MutationRecord[];
  deletes: (table: string) => MutationRecord[];
  selects: (table: string) => QueryRecord[];
}

interface TableConfig {
  rows: MockRow[];
  queryError?: unknown;
  /** Rows returned by .select().single() after an insert/update. Shifts one per call. */
  returnOnMutate?: MockRow[];
  mutateError?:
    | unknown
    | ((operation: 'insert' | 'update' | 'upsert' | 'delete', args: unknown) => unknown);
}

interface MockSupabaseOptions {
  tables?: Record<string, TableConfig>;
  rpcResults?: Record<string, { data?: unknown; error?: unknown }>;
}

export function createMockSupabase(options: MockSupabaseOptions = {}) {
  const tables = options.tables ?? {};
  const rpcResults = options.rpcResults ?? {};

  const mutations: MutationRecord[] = [];
  const queries: QueryRecord[] = [];
  const rpcs: RpcRecord[] = [];

  const tracker: MutationTracker = {
    mutations,
    queries,
    rpcs,
    inserts: (table) => mutations.filter((m) => m.table === table && m.operation === 'insert'),
    updates: (table) => mutations.filter((m) => m.table === table && m.operation === 'update'),
    upserts: (table) => mutations.filter((m) => m.table === table && m.operation === 'upsert'),
    deletes: (table) => mutations.filter((m) => m.table === table && m.operation === 'delete'),
    selects: (table) => queries.filter((q) => q.table === table),
  };

  function buildChain(table: string, operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete', args?: unknown) {
    const filters: Record<string, unknown> = {};
    let singleMode: 'single' | 'maybeSingle' | null = null;
    let selectCalled = false;
    let limitCount: number | null = null;
    let orderSpec: { column: string; ascending: boolean } | null = null;

    const chain: Record<string, unknown> = {};

    // Filter methods
    for (const method of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is'] as const) {
      chain[method] = (col: string, val: unknown) => {
        filters[`${method}:${col}`] = val;
        return chain;
      };
    }

    chain.order = (column: string, options?: { ascending?: boolean }) => {
      orderSpec = {
        column,
        ascending: options?.ascending ?? true,
      };
      return chain;
    };
    chain.limit = (count: number) => {
      limitCount = count;
      return chain;
    };
    chain.single = () => {
      singleMode = 'single';
      return chain;
    };
    chain.maybeSingle = () => {
      singleMode = 'maybeSingle';
      return chain;
    };
    chain.select = () => {
      selectCalled = true;
      return chain;
    };

    // Terminal: make the chain thenable so `await supabase.from(...).select(...)` works
    chain.then = (resolve: (val: unknown) => void, reject: (err: unknown) => void) => {
      try {
        if (operation !== 'select') {
          const tableConf = tables[table];
          const mutateError = typeof tableConf?.mutateError === 'function'
            ? tableConf.mutateError(operation, args)
            : tableConf?.mutateError;

          mutations.push({ table, operation, args, filters });

          if (mutateError) {
            resolve({ data: null, error: mutateError });
            return;
          }

          const mutateReturn = tableConf?.returnOnMutate?.shift();

          if (selectCalled && singleMode && mutateReturn) {
            resolve({ data: mutateReturn, error: null });
          } else if (selectCalled && singleMode) {
            // Return the args as the "inserted/updated" row
            resolve({ data: args, error: null });
          } else {
            resolve({ data: null, error: null });
          }
        } else {
          // SELECT path — return matching rows from config
          const tableConf = tables[table];
          if (tableConf?.queryError) {
            queries.push({ table, operation, args, filters });
            resolve({ data: null, error: tableConf.queryError });
            return;
          }
          const rows = sortRows(filterRows(tableConf?.rows ?? [], filters), orderSpec);
          const limitedRows =
            typeof limitCount === 'number' ? rows.slice(0, Math.max(0, limitCount)) : rows;
          queries.push({ table, operation, args, filters });

          if (singleMode === 'single') {
            resolve({
              data: limitedRows[0] ?? null,
              error: limitedRows.length === 0 ? { message: 'not found' } : null,
            });
          } else if (singleMode === 'maybeSingle') {
            resolve({ data: limitedRows[0] ?? null, error: null });
          } else {
            resolve({ data: limitedRows, error: null });
          }
        }
      } catch (err) {
        reject(err);
      }
    };

    return chain;
  }

  function getRowValue(row: MockRow, column: string) {
    return (row as Record<string, unknown>)[column];
  }

  function rowHasColumn(row: MockRow, column: string) {
    return Object.prototype.hasOwnProperty.call(row, column);
  }

  function filterRows(rows: MockRow[], filters: Record<string, unknown>) {
    return rows.filter((row) => {
      for (const [filterKey, expected] of Object.entries(filters)) {
        const [method, column] = filterKey.split(':');
        const hasColumn = rowHasColumn(row, column);
        const actual = getRowValue(row, column);

        if (method === 'eq') {
          if (!hasColumn) {
            if (column === 'thread_id') return false;
            continue;
          }
          if (actual !== expected) return false;
        } else if (method === 'is') {
          if (!hasColumn) {
            if (expected !== null) return false;
            continue;
          }
          if (actual !== expected) return false;
        } else if (method === 'in') {
          if (!hasColumn) continue;
          if (!Array.isArray(expected) || !expected.includes(actual)) return false;
        } else if (method === 'neq') {
          if (hasColumn && actual === expected) return false;
        } else if (method === 'gt') {
          if (hasColumn && !((actual as string | number) > (expected as string | number))) return false;
        } else if (method === 'gte') {
          if (hasColumn && !((actual as string | number) >= (expected as string | number))) return false;
        } else if (method === 'lt') {
          if (hasColumn && !((actual as string | number) < (expected as string | number))) return false;
        } else if (method === 'lte') {
          if (hasColumn && !((actual as string | number) <= (expected as string | number))) return false;
        }
      }

      return true;
    });
  }

  function sortRows(
    rows: MockRow[],
    order: { column: string; ascending: boolean } | null
  ) {
    if (!order) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aValue = getRowValue(a, order.column);
      const bValue = getRowValue(b, order.column);

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return order.ascending ? -1 : 1;
      if (bValue === null || bValue === undefined) return order.ascending ? 1 : -1;

      const result = (aValue as string | number) < (bValue as string | number) ? -1 : 1;
      return order.ascending ? result : -result;
    });
  }

  const client = {
    from: (table: string) => ({
      select: (cols?: string) => buildChain(table, 'select', cols),
      insert: (data: unknown) => buildChain(table, 'insert', data),
      update: (data: unknown) => buildChain(table, 'update', data),
      upsert: (data: unknown) => buildChain(table, 'upsert', data),
      delete: () => buildChain(table, 'delete'),
    }),
    rpc: (fn: string, args: unknown) => {
      rpcs.push({ fn, args });
      const result = rpcResults[fn];
      return Promise.resolve(result ?? { data: [], error: null });
    },
  };

  return { client, tracker };
}
