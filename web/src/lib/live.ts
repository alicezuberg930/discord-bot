import { useEffect, useRef, useState } from 'react';
import { api, ApiError, EVENTS_URL } from './api';

/**
 * - `live`: connected to the Server-Sent Events stream; changes arrive at once.
 * - `connecting`: (re)connecting to the stream.
 * - `polling`: the stream is unavailable (e.g. a proxy buffers it), so the
 *   page reloads its data every POLL_INTERVAL_MS instead.
 */
export type LiveMode = 'connecting' | 'live' | 'polling';

export const POLL_INTERVAL_MS = 10_000;
/** No `ready` event within this time means the stream is being buffered. */
const READY_TIMEOUT_MS = 8_000;
const RECONNECT_DELAY_MS = 5_000;
/** Safety net while live: also reload now and then (relative times, missed events). */
const LIVE_REFRESH_MS = 120_000;

export function useLiveUpdates({
  onChange,
  onUnauthorized,
}: {
  onChange: () => void;
  onUnauthorized: (message: string) => void;
}): LiveMode {
  const [mode, setMode] = useState<LiveMode>('connecting');
  const callbacks = useRef({ onChange, onUnauthorized });
  callbacks.current = { onChange, onUnauthorized };

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setMode('polling');
      const timer = window.setInterval(
        () => callbacks.current.onChange(),
        POLL_INTERVAL_MS,
      );
      return () => window.clearInterval(timer);
    }

    let source: EventSource | null = null;
    let readyTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let pollTimer: number | undefined;
    let connectedOnce = false;
    let disposed = false;

    const startPolling = () => {
      source?.close();
      setMode('polling');
      pollTimer = window.setInterval(
        () => callbacks.current.onChange(),
        POLL_INTERVAL_MS,
      );
    };

    const connect = () => {
      if (disposed) return;

      setMode('connecting');
      source = new EventSource(EVENTS_URL, { withCredentials: true });
      readyTimer = window.setTimeout(startPolling, READY_TIMEOUT_MS);

      source.addEventListener('ready', () => {
        window.clearTimeout(readyTimer);
        setMode('live');
        // After a reconnect (deploy, network drop) we may have missed events.
        if (connectedOnce) callbacks.current.onChange();
        connectedOnce = true;
      });

      source.addEventListener('change', () => callbacks.current.onChange());

      source.onerror = () => {
        if (source?.readyState !== EventSource.CLOSED) {
          // The browser retries by itself.
          setMode('connecting');
          return;
        }

        // The server refused the stream: find out whether the session ended.
        window.clearTimeout(readyTimer);
        api
          .session()
          .then(() => {
            reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
          })
          .catch((error: unknown) => {
            if (error instanceof ApiError && error.status === 401) {
              callbacks.current.onUnauthorized(error.message);
            } else {
              reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
            }
          });
      };
    };

    connect();
    const refreshTimer = window.setInterval(
      () => callbacks.current.onChange(),
      LIVE_REFRESH_MS,
    );

    return () => {
      disposed = true;
      source?.close();
      window.clearTimeout(readyTimer);
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pollTimer);
      window.clearInterval(refreshTimer);
    };
  }, []);

  return mode;
}
