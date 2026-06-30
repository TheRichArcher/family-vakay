// uuid import removed as it was unused
import apiClient from '../utils/apiClient';
import { convertFirestoreTimestampToString } from '../utils/dateUtils';

export interface Trip {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
  status: 'planning' | 'upcoming' | 'in-progress' | 'completed' | 'cancelled';
  participants: string[];
  ownerId: string;
  coverImageUrl?: string | null; // storage path or full URL (legacy)
  coverImageThumbnailUrl?: string | null;
  coverImageResizedUrl?: string | null;
  budget?: number;
  createdAt?: string;
  updatedAt?: string;
  vacationCode?: string;
  scavengerHuntEnabled?: boolean;
}

export interface TripWithBudget extends Trip {
  totalSpent: number;
}

export type TripData = Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>;
export type PartialTripData = Partial<Omit<Trip, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>;

export const tripsService = {
  async generateCoverUploadUrl(fileName: string, contentType: string): Promise<{ signed_url: string; image_url: string }> {
    const res = await apiClient.post('/api/v1/trips/generate-cover-upload-url', {
      file_name: fileName,
      content_type: contentType,
    });
    return res.data;
  },
  async finalizeCoverUpload(imagePath: string): Promise<{ image_path: string; download_token: string; resized_path?: string | null; thumbnail_path?: string | null }> {
    const res = await apiClient.post('/api/v1/trips/finalize-cover', { image_path: imagePath });
    return res.data;
  },
  async uploadCoverDirect(file: File): Promise<{ image_path: string; download_token: string; resized_path?: string | null; thumbnail_path?: string | null }> {
    const form = new FormData();
    form.append('file', file);
    const res = await apiClient.post('/api/v1/trips/upload-cover-direct', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },
  async getTripById(tripId: string): Promise<Trip> {
    const response = await apiClient.get<Trip>(`/api/v1/trips/${tripId}`, {
      params: {
        timestamp: new Date().getTime(),
      },
    });
    const trip = response.data;
    trip.startDate = convertFirestoreTimestampToString(trip.startDate) || '';
    trip.endDate = convertFirestoreTimestampToString(trip.endDate) || '';
    return trip;
  },

  async getTrips(userId: string): Promise<Trip[]> {
    try {
      const response = await apiClient.get(`/api/v1/trips/`);
      const trips = response.data as Trip[];
      return trips.map(trip => ({
        ...trip,
        startDate: convertFirestoreTimestampToString(trip.startDate) || '',
        endDate: convertFirestoreTimestampToString(trip.endDate) || '',
      }));
    } catch (error) {
      console.error('Error fetching trips:', error);
      throw error;
    }
  },

  async getTripsWithBudgetSummary(): Promise<TripWithBudget[]> {
    try {
      const response = await apiClient.get('/api/v1/trips/with-budget-summary');
      const trips = response.data as TripWithBudget[];
      return trips.map(trip => ({
        ...trip,
        startDate: convertFirestoreTimestampToString(trip.startDate) || '',
        endDate: convertFirestoreTimestampToString(trip.endDate) || '',
      }));
    } catch (error) {
      console.error('Error fetching trips with budget summary:', error);
      throw new Error('Failed to fetch trip budget summaries.');
    }
  },

  async getTripsForFamily(familyId: string): Promise<Trip[]> {
    try {
      const response = await apiClient.get(`/api/v1/trips/family/${familyId}`);
      const trips = response.data as Trip[];
      return trips.map(trip => ({
        ...trip,
        startDate: convertFirestoreTimestampToString(trip.startDate) || '',
        endDate: convertFirestoreTimestampToString(trip.endDate) || '',
      }));
    } catch (error) {
      console.error('Error fetching family trips:', error);
      throw error;
    }
  },

  async getTripsForParticipant(participantId: string): Promise<Trip[]> {
    try {
      // Delegate to the backend to enforce auth and invariants server-side.
      const response = await apiClient.get(`/api/v1/trips/`);
      const trips = response.data as Trip[];
      return trips.map(trip => ({
        ...trip,
        startDate: convertFirestoreTimestampToString(trip.startDate) || '',
        endDate: convertFirestoreTimestampToString(trip.endDate) || '',
      }));
    } catch (error) {
      console.error('Error fetching trips for participant:', error);
      throw error;
    }
  },

  async createTrip(trip: TripData, userId: string): Promise<Trip> {
    try {
      if (!userId) {
        throw new Error('User ID is required to create a trip');
      }

      if (trip.ownerId !== userId) {
        throw new Error('Trip ownerId must match the current user ID');
      }

      const response = await apiClient.post('/api/v1/trips/', trip);
      return response.data;
    } catch (error) {
      console.error('Error creating trip:', error);
      throw error;
    }
  },

  async updateTrip(tripId: string, tripUpdateData: PartialTripData): Promise<Trip> {
    // Prefer backend API to enforce invariants and for consistent auditing.
    const sanitizedUpdateData = Object.fromEntries(
      Object.entries(tripUpdateData as Record<string, unknown>).filter(([, value]) => value !== undefined)
    );
    try {
      const response = await apiClient.put(`/api/v1/trips/${tripId}`, sanitizedUpdateData);
      const trip = response.data as Trip;
      trip.startDate = convertFirestoreTimestampToString(trip.startDate) || '';
      trip.endDate = convertFirestoreTimestampToString(trip.endDate) || '';
      return trip;
    } catch (error) {
      console.error('Error updating trip via API:', error);
      throw error;
    }
  },

  async deleteTrip(tripId: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/trips/${tripId}`);
    } catch (error) {
      console.error('Error deleting trip:', error);
      throw error;
    }
  },

  async updateTripParticipants(tripId: string, participantUids: string[]): Promise<void> {
    await apiClient.put(`/api/v1/trips/${tripId}/participants`, {
      participant_uids: participantUids,
    });
  },

  async getTripByCode(code: string): Promise<Trip | null> {
    try {
      const response = await apiClient.get(`/api/v1/trips/by-code/${code}`);
      const trip = response.data as Trip;
      trip.startDate = convertFirestoreTimestampToString(trip.startDate) || '';
      trip.endDate = convertFirestoreTimestampToString(trip.endDate) || '';
      return trip;
    } catch (error) {
      // If the API returns 404, map to null to preserve existing caller behavior
      const status = (error as any)?.response?.status;
      if (status === 404) {
        return null;
      }
      console.error('Error fetching trip by code via API:', error);
      throw error;
    }
  }
};
