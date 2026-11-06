import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useTournamentStore } from '../store/tournamentStore';

/**
 * Custom hook to set up Supabase real-time subscriptions
 * This replaces the need for continuous polling (setInterval)
 * and reduces database load significantly
 * 
 * Falls back to slower polling if real-time is not available
 */
export const useRealtimeSubscriptions = () => {
  const refreshData = useTournamentStore(state => state.refreshData);
  const isSubscribedRef = useRef(false);
  const hasErrorRef = useRef(false);
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stable reference to refreshData
  const refreshDataRef = useRef(refreshData);
  useEffect(() => {
    refreshDataRef.current = refreshData;
  }, [refreshData]);

  useEffect(() => {
    console.log('[REALTIME] Setting up Supabase real-time subscriptions...');

    // Callback for all table changes
    const handleChange = (tableName: string) => (payload: any) => {
      console.log(`[REALTIME] ${tableName} table changed:`, payload.eventType);
      refreshDataRef.current();
    };

    // Subscribe to all table changes
    const channel = supabase
      .channel('tournament-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'teams'
        },
        handleChange('Teams')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches'
        },
        handleChange('Matches')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'courts'
        },
        handleChange('Courts')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'referees'
        },
        handleChange('Referees')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups'
        },
        handleChange('Groups')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pools'
        },
        handleChange('Pools')
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
          hasErrorRef.current = false;
          console.log('[REALTIME] ✅ Successfully subscribed to real-time updates');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hasErrorRef.current = true;
          console.warn('[REALTIME] ⚠️ Real-time subscription failed, using fallback polling');
        }
      });

    // Fallback polling if real-time fails or is not available
    // This ensures live updates work even if real-time is not enabled
    
    // Wait 5 seconds to see if subscription succeeds, then start fallback if needed
    const fallbackTimer = setTimeout(() => {
      if (!isSubscribedRef.current || hasErrorRef.current) {
        console.log('[REALTIME] Starting fallback polling (every 30 seconds)...');
        fallbackIntervalRef.current = setInterval(() => {
          refreshDataRef.current();
        }, 30000); // 30 seconds fallback polling (reduced from 10s)
      }
    }, 5000);

    // Cleanup function
    return () => {
      console.log('[REALTIME] Cleaning up subscriptions...');
      clearTimeout(fallbackTimer);
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, []); // Empty dependency array - only run once on mount
};
