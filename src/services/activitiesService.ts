import apiClient from '../utils/apiClient';
import { convertFirestoreTimestampToString } from '../utils/dateUtils';
import { Vote } from '../types/activity';

export interface Rating {
  rating: number;
  feedback?: string;
  ratedAt?: string;
}

export interface ChallengeCompletion {
  completed: boolean;
  imageUrl?: string;
  pointsAwarded?: number;
  status?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'error';
  comment?: string;
  ratings?: { [userId: string]: 'happy' | 'neutral' | 'sad' };
  coverImageUrl?: string | null;
}

export interface Challenge {
  text: string;
  age_group?: string;
  /** @deprecated - use completions map instead */
  completed?: boolean; 
  completions?: { [userId: string]: ChallengeCompletion };
  
  // Legacy fields for AI hunt, to be migrated
  imageUrl?: string;
  pointsAwarded?: number;
  status?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'error';
  comment?: string;
}

export interface GalleryImage {
  url: string;
  userId: string;
  uploadedAt: string;
  resizedUrl?: string;
  thumbnailUrl?: string;
}

export interface Activity {
  id: string;
  tripId: string | null;
  name: string;
  activityTypes?: string[];
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  location?: string;
  website?: string;
  budget?: number;
  cost?: number;
  additionalExpenses?: number;
  budgetCategory?: string;
  paymentStatus?: 'unpaid' | 'deposit-paid' | 'paid';
  amountPaid?: number;
  mood?: 'happy' | 'neutral' | 'sad' | 'tired';
  /** @deprecated - use images instead */
  imageUrls?: string[];
  images?: GalleryImage[];
  challenges?: Challenge[];
  isSurprise?: boolean;
  isBooked?: boolean;
  isIdea?: boolean;
  votes?: { [userId: string]: Vote };
  ratings?: { [userId: string]: Rating };
  coverImageUrl?: string | null;
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  itineraryStopId?: string | null;
  itineraryDate?: string | null;
  portName?: string | null;
}

export type ActivityData = Omit<Activity, 'id'>;

export interface PartialActivityData {
  name?: string;
  activityTypes?: string[];
  description?: string;
  date?: string;
  time?: string;
  endTime?: string;
  location?: string;
  website?: string;
  budget?: number;
  cost?: number;
  additionalExpenses?: number;
  budgetCategory?: string;
  paymentStatus?: 'unpaid' | 'deposit-paid' | 'paid';
  amountPaid?: number;
  mood?: 'happy' | 'neutral' | 'sad' | 'tired';
  imageUrls?: string[];
  images?: Array<{ url: string; userId: string; uploadedAt: string }>;
  challenges?: Challenge[];
  isSurprise?: boolean;
  isBooked?: boolean;
  isIdea?: boolean;
  votes?: { [userId: string]: Vote };
  ratings?: { [userId: string]: Rating };
  coverImageUrl?: string | null;
  priceRange?: '$' | '$$' | '$$$' | '$$$$';
  itineraryStopId?: string | null;
  itineraryDate?: string | null;
  portName?: string | null;
}

export const activitiesService = {
  async getActivitiesForTrip(tripId: string, currentUser?: any): Promise<Activity[]> {
    if (!tripId) {
      console.error("tripId is undefined or null in getActivitiesForTrip");
      return [];
    }
    const response = await apiClient.get(`/api/v1/trips/${tripId}/activities`);
    return (response.data as any[]).map((activity: any) => ({
      ...activity,
      date: convertFirestoreTimestampToString(activity.date),
    }));
  },

  async getAllActivities(): Promise<Activity[]> {
    const response = await apiClient.get('/api/v1/activities/all');
    return response.data.map((activity: any) => ({
      ...activity,
      date: convertFirestoreTimestampToString(activity.date),
    }));
  },

  async createActivity(activityData: ActivityData): Promise<Activity> {
    const response = await apiClient.post('/api/v1/activities/', activityData);
    return response.data;
  },

  async updateActivity(
    activityId: string,
    activityUpdateData: PartialActivityData
  ): Promise<void> {
    await apiClient.put(`/api/v1/activities/${activityId}`, activityUpdateData);
  },

  async deleteActivity(tripId: string, activityId: string): Promise<void> {
    try {
      // The backend route was changed to be more RESTful.
      await apiClient.delete(`/api/v1/activities/trip/${tripId}/activity/${activityId}`);
    } catch (error) {
      console.error('Error deleting activity:', error);
      // The global error handler in apiClient should have already shown an alert.
      // We throw the error so the calling component can react to it (e.g., stop a loading spinner).
      throw error;
    }
  },

  async deleteActivityIdea(activityId: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/activities/${activityId}`);
    } catch (error) {
      console.error('Error deleting activity idea:', error);
      throw error;
    }
  },

  async rateActivity(activityId: string, rating: number, feedback?: string): Promise<Activity> {
    try {
      const response = await apiClient.post(`/api/v1/activities/${activityId}/rate`, {
        rating,
        feedback,
      });
      return response.data;
    } catch (error) {
      console.error('Error rating activity:', error);
      throw error;
    }
  },

  async uploadImageForActivity(activityId: string, imageUri: string): Promise<Activity> {
    const assetUri = imageUri;
    const fileName = assetUri.split('/').pop() || 'photo.jpg';
    let contentType = 'image/jpeg'; // Default

    // A simple way to guess content type from extension
    if (fileName.endsWith('.png')) {
        contentType = 'image/png';
    }

    try {
        // 1. Get signed URL from our backend
        const { signed_url, image_url } = await apiClient.post(
            `/api/v1/activities/${activityId}/generate-upload-url`,
            { file_name: fileName, content_type: contentType }
        ).then(res => res.data);

        // 2. Upload image to the signed URL
        const response = await fetch(assetUri);
        const blob = await response.blob();

        const uploadResponse = await fetch(signed_url, {
            method: 'PUT',
            body: blob,
            headers: {
                'Content-Type': contentType,
            },
        });

        if (!uploadResponse.ok) {
            throw new Error('Failed to upload image to storage.');
        }

        // 3. Confirm the upload with our backend
        const updatedActivityResponse = await apiClient.post(
            `/api/v1/activities/${activityId}/add-image`,
            { image_url: image_url }
        );
        
        return updatedActivityResponse.data;
    } catch (error) {
        console.error("Image upload process failed:", error);
        // The global error handler in apiClient will show an alert.
        throw error; // Re-throw to let the calling component handle UI state
    }
  },

  async updateChallengeStatus(activityId: string, challengeIndex: number, userId: string, status: 'approved' | 'rejected', comment: string, points: number): Promise<void> {
    await apiClient.post(`/api/v1/activities/${activityId}/challenges/${challengeIndex}/status`, {
      user_id: userId,
      status: status,
      comment: comment,
      points_awarded: points,
    });
  },

  listenForChallengeUpdates(activityId: string, onUpdate: (data: any) => void) {
    let cancelled = false;

    const fetchLatest = async () => {
      try {
        const res = await apiClient.get(`/api/v1/activities/${activityId}`);
        if (!cancelled) {
          onUpdate(res.data);
        }
      } catch (_e) {
        // Silently ignore transient fetch errors; caller can handle UI state
      }
    };

    // Initial fetch then poll every 4 seconds
    fetchLatest();
    const intervalId = setInterval(fetchLatest, 4000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }
};
