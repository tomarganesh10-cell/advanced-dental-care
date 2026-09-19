"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch-when-input-changes, as a single hook.
 *
 * This exists so the "flip a loading flag, then await" pattern lives in exactly
 * one place. React's `set-state-in-effect` rule flags that pattern because
 * cascading renders are usually a mistake; here the extra render IS the
 * behaviour — it is what shows the spinner. Confining it to one hook means one
 * documented exception instead of a disable comment in every component that
 * loads data.
 *
 * It also handles the two things hand-rolled fetch effects usually get wrong:
 *  - out-of-order responses: a slow request for Tuesday must not overwrite a
 *    fast one for Wednesday, so replies are matched against a request counter
 *  - abandoned requests: the fetch is aborted when inputs change or the
 *    component unmounts
 */

export type AsyncState<T> =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: T | null; error: null }
  | { status: "success"; data: T; error: null }
  | { status: "error"; data: null; error: string };

const IDLE: AsyncState<never> = { status: "idle", data: null, error: null };

export interface UseAsyncDataResult<T> {
  state: AsyncState<T>;
  /** Re-runs the fetch with the current inputs. */
  reload: () => void;
}

export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
  options: { enabled?: boolean } = {},
): UseAsyncDataResult<T> {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<AsyncState<T>>(IDLE);
  const [reloadToken, setReloadToken] = useState(0);

  // Monotonic request id. Only the newest request may write to state.
  const requestId = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const id = ++requestId.current;
    const controller = new AbortController();

    // Deliberate: this is the render that shows the spinner.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((previous) => ({
      status: "loading",
      // Keep previous data visible while refreshing, so a list does not flash
      // empty between two dates.
      data: previous.status === "success" ? previous.data : null,
      error: null,
    }));

    void (async () => {
      try {
        const data = await fetcher(controller.signal);
        if (id !== requestId.current) return;
        setState({ status: "success", data, error: null });
      } catch (error) {
        if (id !== requestId.current || controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    })();

    return () => controller.abort();
    // The caller's `deps` is the contract for when to refetch; `fetcher` is an
    // inline closure over exactly those values, so listing it would refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Derived rather than stored: a disabled query reports idle without an effect
  // having to reset it, which removes a whole class of stale-state bug.
  return { state: enabled ? state : IDLE, reload };
}
