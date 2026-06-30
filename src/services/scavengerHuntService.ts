import apiClient from "../utils/apiClient";

export const scavengerHuntService = {
    async generateUploadUrl(tripId: string, activityId: string, challengeIndex: number, fileName: string, contentType: string) {
        const response = await apiClient.post(`/api/v1/trips/${tripId}/activities/${activityId}/challenges/${challengeIndex}/generate-upload-url`, {
            file_name: fileName,
            content_type: contentType,
        });
        return response.data;
    },

    async submitChallengeForScoring(tripId: string, activityId: string, challengeIndex: number, imageUrl: string) {
        const response = await apiClient.post(`/api/v1/trips/${tripId}/activities/${activityId}/challenges/${challengeIndex}/submit`, {
            image_url: imageUrl,
        });
        return response.data;
    }
} 