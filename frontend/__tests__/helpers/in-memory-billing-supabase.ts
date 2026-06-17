export interface InMemoryBillingSupabase {
  state: Record<string, Record<string, unknown>[]>;
  from: (table: string) => {
    select: () => unknown;
    insert: (row: Record<string, unknown>) => Promise<{ error: null | { code?: string; message: string } }>;
    upsert: (row: Record<string, unknown>) => Promise<{ error: null }>;
    update: (row: Record<string, unknown>) => unknown;
  };
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: null | { message: string } }>;
}

function keyFor(table: string, row: Record<string, unknown>) {
  if (table === 'billing_customers') return row.user_id;
  if (table === 'billing_subscriptions') return row.subscription_id;
  if (table === 'billing_entitlements') return row.user_id;
  if (table === 'billing_webhook_events') return row.event_id;
  return row.id;
}

function applyFilters(rows: Record<string, unknown>[], filters: Record<string, unknown>) {
  return rows.filter((row) =>
    Object.entries(filters).every(([column, value]) => row[column] === value)
  );
}

export function createInMemoryBillingSupabase(): InMemoryBillingSupabase {
  const state: Record<string, Record<string, unknown>[]> = {
    billing_customers: [],
    billing_subscriptions: [],
    billing_entitlements: [],
    billing_webhook_events: [],
  };

  return {
    state,
    from(table: string) {
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            maybeSingle() {
              return Promise.resolve({
                data: applyFilters(state[table] ?? [], filters)[0] ?? null,
                error: null,
              });
            },
            order() {
              return chain;
            },
            then(resolve: (value: unknown) => void) {
              resolve({
                data: applyFilters(state[table] ?? [], filters),
                error: null,
              });
            },
          };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          const key = keyFor(table, row);
          if ((state[table] ?? []).some((existing) => keyFor(table, existing) === key)) {
            return Promise.resolve({ error: { code: '23505', message: 'duplicate' } });
          }
          state[table].push(row);
          return Promise.resolve({ error: null });
        },
        upsert(row: Record<string, unknown>) {
          const key = keyFor(table, row);
          const index = state[table].findIndex((existing) => keyFor(table, existing) === key);
          if (index >= 0) {
            state[table][index] = { ...state[table][index], ...row };
          } else {
            state[table].push(row);
          }
          return Promise.resolve({ error: null });
        },
        update(row: Record<string, unknown>) {
          const filters: Record<string, unknown> = {};
          return {
            eq(column: string, value: unknown) {
              filters[column] = value;
              for (const existing of applyFilters(state[table] ?? [], filters)) {
                Object.assign(existing, row);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      if (fn !== 'upsert_billing_subscription_if_newer') {
        return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
      }

      const row = args.p_subscription as Record<string, unknown>;
      const subscriptionId = row.subscription_id;
      const existingIndex = state.billing_subscriptions.findIndex(
        (existing) => existing.subscription_id === subscriptionId
      );

      if (existingIndex < 0) {
        state.billing_subscriptions.push(row);
        return Promise.resolve({ data: true, error: null });
      }

      const existing = state.billing_subscriptions[existingIndex];
      const previousCreated = new Date(
        String(existing.last_stripe_event_created ?? '')
      ).getTime();
      const nextCreated = new Date(
        String(row.last_stripe_event_created ?? '')
      ).getTime();
      const previousTime = Number.isFinite(previousCreated) ? previousCreated : -Infinity;
      const nextTime = Number.isFinite(nextCreated) ? nextCreated : -Infinity;
      const previousId = String(existing.last_stripe_event_id ?? '');
      const nextId = String(row.last_stripe_event_id ?? '');
      const shouldApply =
        previousTime < nextTime || (previousTime === nextTime && previousId < nextId);

      if (!shouldApply) {
        return Promise.resolve({ data: false, error: null });
      }

      state.billing_subscriptions[existingIndex] = { ...existing, ...row };
      return Promise.resolve({ data: true, error: null });
    },
  };
}
