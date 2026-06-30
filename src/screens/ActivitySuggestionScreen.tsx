import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { colors } from '../theme/colors';
import InterestsSurvey from '../components/InterestsSurvey';
import { ActivitySuggestion, aiService } from '../services/aiService';
import { TripsStackParamList } from '../navigation/AppNavigator';

type ActivitySuggestionRouteProp = RouteProp<TripsStackParamList, 'ActivitySuggestion'>;

const ActivitySuggestionScreen = () => {
  const route = useRoute<ActivitySuggestionRouteProp>();
  const tripId = route.params?.tripId;
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [showSurvey, setShowSurvey] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  if (!tripId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No trip selected</Text>
        <Text style={styles.emptyStateText}>Open a trip and tap "Get Suggestions" to see activity ideas.</Text>
      </View>
    );
  }

  const handleSurveySubmit = async (interests: string[]) => {
    setIsLoading(true);
    try {
      const response = await aiService.suggestActivities(tripId, interests);
      const parsed = response.suggestions || JSON.parse(response.text);
      const parsedSuggestions = (Array.isArray(parsed) ? parsed : parsed.suggestions) as ActivitySuggestion[];
      if (!Array.isArray(parsedSuggestions) || parsedSuggestions.length === 0) {
        throw new Error('No suggestions returned');
      }
      setSuggestions(parsedSuggestions);
      setShowSurvey(false);
    } catch (error) {
      console.error('Failed to get suggestions:', error);
      Alert.alert('Error', 'Failed to get suggestions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showSurvey ? (
        <InterestsSurvey onSubmit={handleSurveySubmit} />
      ) : (
        <View>
          <Text style={styles.title}>Here are some suggestions:</Text>
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.suggestionItem}>
                <View style={styles.suggestionHeader}>
                  <Text style={styles.suggestionTitle}>{item.title}</Text>
                  {!!item.category && <Text style={styles.categoryPill}>{item.category}</Text>}
                </View>
                {!!item.why && <Text style={styles.suggestionText}>{item.why}</Text>}
                <View style={styles.metaRow}>
                  {!!item.kidFit && <Text style={styles.metaText}>{item.kidFit}</Text>}
                  {!!item.costLevel && <Text style={styles.metaText}>{item.costLevel}</Text>}
                  {!!item.timeNeeded && <Text style={styles.metaText}>{item.timeNeeded}</Text>}
                </View>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    color: colors.text,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  suggestionItem: {
    padding: 15,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    marginBottom: 10,
    backgroundColor: colors.white,
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  suggestionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  categoryPill: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ActivitySuggestionScreen;
