import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { colors } from '../theme/colors';
import InterestsSurvey from '../components/InterestsSurvey';
import { ActivitySuggestion, aiService } from '../services/aiService';
import { TripsStackParamList } from '../navigation/AppNavigator';
import { activitiesService, ActivityData } from '../services/activitiesService';
import { ItineraryStop, Trip, tripsService } from '../services/trips';

type ActivitySuggestionRouteProp = RouteProp<TripsStackParamList, 'ActivitySuggestion'>;

const ActivitySuggestionScreen = () => {
  const route = useRoute<ActivitySuggestionRouteProp>();
  const tripId = route.params?.tripId;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | undefined>();
  const [suggestions, setSuggestions] = useState<ActivitySuggestion[]>([]);
  const [showSurvey, setShowSurvey] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isTripLoading, setIsTripLoading] = useState(true);
  const [savedSuggestionIds, setSavedSuggestionIds] = useState<string[]>([]);
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadTrip = async () => {
      if (!tripId) {
        setIsTripLoading(false);
        return;
      }
      setIsTripLoading(true);
      try {
        const fetchedTrip = await tripsService.getTripById(tripId);
        if (!isMounted) return;
        setTrip(fetchedTrip);
        const firstStop = fetchedTrip.itinerary?.[0];
        if ((fetchedTrip.tripType === 'multiLocation' || fetchedTrip.tripType === 'cruise') && firstStop) {
          setSelectedStopId(firstStop.id);
        }
      } catch (error) {
        console.error('Failed to load trip for suggestions:', error);
        Alert.alert('Error', 'Could not load the trip itinerary.');
      } finally {
        if (isMounted) setIsTripLoading(false);
      }
    };
    loadTrip();
    return () => {
      isMounted = false;
    };
  }, [tripId]);

  const selectedStop = trip?.itinerary?.find(stop => stop.id === selectedStopId);

  const handleSurveySubmit = async (interests: string[]) => {
    if (!tripId) return;
    setIsLoading(true);
    try {
      const response = await aiService.suggestActivities(tripId, interests, selectedStopId);
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

  const mapCostLevelToPriceRange = (costLevel?: string): ActivityData['priceRange'] => {
    const normalized = (costLevel || '').toLowerCase();
    if (normalized.includes('free') || normalized.includes('low') || normalized.includes('$')) return '$';
    if (normalized.includes('moderate') || normalized.includes('medium') || normalized.includes('$$')) return '$$';
    if (normalized.includes('high') || normalized.includes('expensive') || normalized.includes('$$$')) return '$$$';
    return undefined;
  };

  const handleAddToDecisionBoard = async (suggestion: ActivitySuggestion) => {
    if (!tripId || savedSuggestionIds.includes(suggestion.id)) return;

    setSavingSuggestionId(suggestion.id);
    try {
      const descriptionParts = [
        suggestion.why,
        suggestion.kidFit ? `Kid fit: ${suggestion.kidFit}` : undefined,
        suggestion.costLevel ? `Cost: ${suggestion.costLevel}` : undefined,
        suggestion.timeNeeded ? `Time needed: ${suggestion.timeNeeded}` : undefined,
        selectedStop ? `Trip stop: ${formatStopLabel(selectedStop)}` : undefined,
      ].filter(Boolean);

      const activityData: ActivityData = {
        tripId,
        name: suggestion.title,
        description: descriptionParts.join('\n'),
        activityTypes: suggestion.category ? [suggestion.category] : [],
        date: suggestion.itineraryDate || selectedStop?.date,
        location: suggestion.portName || selectedStop?.portName || undefined,
        isIdea: true,
        isBooked: false,
        isSurprise: false,
        votes: {},
        priceRange: mapCostLevelToPriceRange(suggestion.costLevel),
        imageUrls: [],
        images: [],
        challenges: [],
        itineraryStopId: suggestion.itineraryStopId || selectedStop?.id,
        itineraryDate: suggestion.itineraryDate || selectedStop?.date,
        portName: suggestion.portName || selectedStop?.portName,
      };

      await activitiesService.createActivity(activityData);
      setSavedSuggestionIds(prev => [...prev, suggestion.id]);
    } catch (error) {
      console.error('Failed to add suggestion to decision board:', error);
      Alert.alert('Error', 'Could not add this suggestion to the Decision Board.');
    } finally {
      setSavingSuggestionId(null);
    }
  };

  if (!tripId) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>No trip selected</Text>
        <Text style={styles.emptyStateText}>Open a trip and tap "Get Suggestions" to see activity ideas.</Text>
      </View>
    );
  }

  const formatStopLabel = (stop: ItineraryStop) => {
    const typeLabel = stop.type === 'sea'
      ? 'Sea Day'
      : stop.type === 'embark'
        ? 'Embark'
        : stop.type === 'debark'
          ? 'Debark'
          : 'Port';
    const timeWindow = [stop.arrivalTime, stop.departureTime].filter(Boolean).join(' - ');
    return `${stop.date} • ${typeLabel} • ${stop.portName}${timeWindow ? ` • ${timeWindow}` : ''}`;
  };

  if (isLoading || isTripLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showSurvey ? (
        <>
          {(trip?.tripType === 'multiLocation' || trip?.tripType === 'cruise') && (
            <View style={styles.stopSelector}>
              <Text style={styles.title}>Pick a day or location</Text>
              {trip.itinerary && trip.itinerary.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {trip.itinerary.map(stop => (
                    <TouchableOpacity
                      key={stop.id}
                      style={[
                        styles.stopChip,
                        selectedStopId === stop.id && styles.stopChipActive,
                      ]}
                      onPress={() => setSelectedStopId(stop.id)}
                    >
                      <Text style={[
                        styles.stopChipTitle,
                        selectedStopId === stop.id && styles.stopChipTitleActive,
                      ]}>
                        {stop.portName}
                      </Text>
                      <Text style={[
                        styles.stopChipText,
                        selectedStopId === stop.id && styles.stopChipTextActive,
                      ]}>
                        {stop.date} • {stop.type === 'sea' ? 'Sea day' : stop.type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.emptyStateText}>Add itinerary stops in Manage Trip first. Until then, suggestions will use the overall trip.</Text>
              )}
            </View>
          )}
          <InterestsSurvey onSubmit={handleSurveySubmit} />
        </>
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
                {!!(item.portName || item.itineraryDate) && (
                  <Text style={styles.stopMetaText}>
                    {[item.itineraryDate, item.portName].filter(Boolean).join(' • ')}
                  </Text>
                )}
                <View style={styles.metaRow}>
                  {!!item.kidFit && <Text style={styles.metaText}>{item.kidFit}</Text>}
                  {!!item.costLevel && <Text style={styles.metaText}>{item.costLevel}</Text>}
                  {!!item.timeNeeded && <Text style={styles.metaText}>{item.timeNeeded}</Text>}
                </View>
                <TouchableOpacity
                  style={[
                    styles.addButton,
                    savedSuggestionIds.includes(item.id) && styles.addButtonSaved,
                  ]}
                  onPress={() => handleAddToDecisionBoard(item)}
                  disabled={savedSuggestionIds.includes(item.id) || savingSuggestionId === item.id}
                >
                  <Text style={styles.addButtonText}>
                    {savedSuggestionIds.includes(item.id)
                      ? 'Added to Decision Board'
                      : savingSuggestionId === item.id
                        ? 'Adding...'
                        : 'Add to Decision Board'}
                  </Text>
                </TouchableOpacity>
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
  stopSelector: {
    marginBottom: 18,
  },
  stopChip: {
    minWidth: 150,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
    backgroundColor: colors.white,
  },
  stopChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stopChipTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 4,
  },
  stopChipTitleActive: {
    color: colors.white,
  },
  stopChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  stopChipTextActive: {
    color: colors.white,
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
  stopMetaText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
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
  addButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  addButtonSaved: {
    backgroundColor: colors.success,
  },
  addButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default ActivitySuggestionScreen;
