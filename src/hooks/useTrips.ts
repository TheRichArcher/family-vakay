import { useState, useCallback } from 'react';
import { Trip, tripsService } from '../services/trips';

export function useTrips(userId: string) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrips = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await tripsService.getTrips(userId);
      setTrips(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trips');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const createTrip = useCallback(async (trip: Omit<Trip, 'id'>) => {
    setIsLoading(true);
    setError(null);
    try {
      const newTrip = await tripsService.createTrip(trip, userId);
      setTrips(prev => [...prev, newTrip]);
      return newTrip;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trip');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  const updateTrip = useCallback(async (id: string, trip: Partial<Trip>) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedTrip = await tripsService.updateTrip(id, trip);
      setTrips(prev => prev.map(t => t.id === id ? updatedTrip : t));
      return updatedTrip;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update trip');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteTrip = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await tripsService.deleteTrip(id);
      setTrips(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete trip');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    trips,
    isLoading,
    error,
    fetchTrips,
    createTrip,
    updateTrip,
    deleteTrip,
  };
} 