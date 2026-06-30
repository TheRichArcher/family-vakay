import apiClient from '../utils/apiClient';

export interface AIResponse {
  text: string;
  suggestions?: ActivitySuggestion[];
}

export interface ActivitySuggestion {
  id: string;
  title: string;
  category?: string;
  why?: string;
  kidFit?: string;
  costLevel?: string;
  timeNeeded?: string;
  itineraryStopId?: string | null;
  itineraryDate?: string | null;
  portName?: string | null;
}

const parseSuggestions = (response: AIResponse): ActivitySuggestion[] => {
  if (Array.isArray(response.suggestions)) {
    return response.suggestions;
  }
  try {
    const parsed = JSON.parse(response.text);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions;
    }
  } catch {
    // Preserve existing fallback behavior for non-JSON AI responses.
  }
  return [];
};

const formatSuggestionForInline = (suggestion: ActivitySuggestion): string => {
  const detail = suggestion.why ? ` ${suggestion.why}` : '';
  return `${suggestion.title}.${detail}`.trim();
}

export const aiService = {
  async generateJokeOrFact(tripId: string): Promise<AIResponse> {
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/generate-joke-fact`, {});
    return response.data;
  },

  async suggestActivity(tripId: string, context?: string, itineraryStopId?: string): Promise<AIResponse> {
    const payload = { context: context || 'anywhere', itinerary_stop_id: itineraryStopId };
    const response = await apiClient.post<AIResponse>(`/api/v1/ai/trips/${tripId}/suggest-activity`, payload);
    const suggestions = parseSuggestions(response.data);
    if (suggestions.length > 0) {
      return {
        ...response.data,
        text: formatSuggestionForInline(suggestions[0]),
        suggestions,
      };
    }
    return response.data;
  },

  async suggestActivities(tripId: string, interests: string[], itineraryStopId?: string): Promise<AIResponse> {
    const prompt = `Based on the following interests: ${interests.join(', ')}, suggest some activities.`;
    const payload = { context: prompt, itinerary_stop_id: itineraryStopId };
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
