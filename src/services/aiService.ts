import apiClient from '../utils/apiClient';

export interface AIResponse {
  text: string;
}

export const aiService = {
  async generateJokeOrFact(tripId: string): Promise<AIResponse> {
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/generate-joke-fact`, {});
    return response.data;
  },

  async suggestActivity(tripId: string, context?: string): Promise<AIResponse> {
    const payload = { context: context || 'anywhere' };
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/suggest-activity`, payload);
    return response.data;
  },

  async suggestActivities(tripId: string, interests: string[]): Promise<AIResponse> {
    const prompt = `Based on the following interests: ${interests.join(', ')}, suggest some activities.`;
    const payload = { context: prompt };
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/suggest-activity`, payload);
    return response.data;
  },

  async createStory(keywords: string[], tripId: string): Promise<AIResponse> {
    if (!tripId) {
      throw new Error("A trip must be selected to create a story.");
    }
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/create-story`, { keywords });
    return response.data;
  },

  async generateHunt(tripId: string): Promise<any> {
    const response = await apiClient.post(`/api/v1/trips/${tripId}/generate-ai-hunt`);
    return response.data;
  },
};
