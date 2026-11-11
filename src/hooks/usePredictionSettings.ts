import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Used until the real close time (set by the admin, table prediction_settings) has loaded. */
const FALLBACK_DEADLINE = '2026-11-11T20:00:00+05:30';

/**
 * Prediction close time and allowed sign-in methods (both set by the admin), kept live,
 * plus a countdown that ticks every second.
 */
export const usePredictionSettings = () => {
  const [deadline, setDeadline] = useState(() => new Date(FALLBACK_DEADLINE));
  const [logins, setLogins] = useState({ google: false, email: false, loaded: false });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const load = () =>
      supabase
        .from('prediction_settings')
        .select('deadline, google_login, email_login')
        .eq('id', 1)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.deadline) setDeadline(new Date(data.deadline));
          if (data) setLogins({ google: data.google_login, email: data.email_login, loaded: true });
        });
    load();
    // The admin can change the close time (or close picks now) at any moment
    const channel = supabase
      .channel(`prediction-settings-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_settings' }, () => load())
      .subscribe();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);
  return { deadline, logins, closed: now >= deadline.getTime(), msLeft: Math.max(0, deadline.getTime() - now) };
};

/** "4h 05m 09s", or "5m 09s" in the last hour. */
export const formatCountdown = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m ${s}s` : `${m}m ${s}s`;
};
