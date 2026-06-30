import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useAuth } from '../contexts/AuthContext';
import { activitiesService, Activity } from '../services/activitiesService';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TripsStackParamList } from '../navigation/AppNavigator';
import { getDateTime } from '../utils/dateUtils';
import { openWebsiteUrl } from '../utils/urlUtils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type CalendarScreenNavigationProp = NativeStackNavigationProp<TripsStackParamList, 'Calendar'>;
type CalendarScreenRouteProp = RouteProp<TripsStackParamList, 'Calendar'>;


export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  type: 'trip' | 'activity';
  color: string;
  imageUrl?: string;
  description?: string;
  location?: string;
  budget?: number;
  mood?: Activity['mood'];
  time?: string;
  tripId?: string;
  website?: string;
  isBooked?: boolean;
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<CalendarScreenNavigationProp>();
  const route = useRoute<CalendarScreenRouteProp>();
  const { trip } = route.params;

  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(trip.startDate);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const getMoodColor = (mood?: string) => {
    switch (mood) {
      case 'happy':
        return colors.success;
      case 'neutral':
        return colors.accent;
      case 'sad':
        return colors.error;
      case 'tired':
        return colors.muted;
      default:
        return colors.primary;
    }
  };

  const loadData = useCallback(async () => {
    if (!user?.uid || !trip?.id) return;

    setIsLoading(true);
    try {
      // Trip is already passed in, no need to fetch again
      navigation.setOptions({ title: `${trip.name} Calendar` });

      const tripEvents: CalendarEvent[] = [{
        id: trip.id,
        title: trip.name,
        date: new Date(trip.startDate),
        type: 'trip',
        color: '#007AFF',
        imageUrl: trip.coverImageUrl || undefined,
        description: trip.description,
      }];

      // Load activities for the trip
      const fetchedActivities = await activitiesService.getActivitiesForTrip(trip.id);
      setActivities(fetchedActivities); // Set activities for use in sorting
      const activityEvents: CalendarEvent[] = fetchedActivities.map((activity: Activity) => ({
        id: activity.id,
        title: activity.name,
        date: activity.date ? parseISO(activity.date) : new Date(), // Use a placeholder for dateless activities
        type: 'activity',
        color: getMoodColor(activity.mood),
        imageUrl: activity.imageUrls ? activity.imageUrls[0] : undefined,
        description: activity.description,
        location: activity.location,
        budget: activity.budget,
        mood: activity.mood,
        time: activity.time,
        tripId: activity.tripId ?? undefined,
        website: activity.website,
        isBooked: activity.isBooked,
      }));

      // Combine and sort all events
      const allEvents = [...tripEvents, ...activityEvents].sort(
        (a, b) => a.date.getTime() - b.date.getTime()
      );

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading calendar data:', error);
      Alert.alert('Error', 'Failed to load calendar data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.uid, trip, navigation]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const getEventsForDate = (date: string) => {
    const filteredEvents = events.filter(event => {
      if (event.type === 'trip') {
        const eventDate = new Date(event.date);
        return isWithinInterval(new Date(date), {
          start: new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()),
          end: new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()),
        });
      }
      return event.date.toISOString().split('T')[0] === date;
    });

    // Sort the events for the day chronologically
    return filteredEvents.sort((a, b) => {
        // Find the original activity to pass to getDateTime
        const activityA = activities.find(act => act.id === a.id);
        const activityB = activities.find(act => act.id === b.id);

        if (activityA && activityB) {
            return getDateTime(activityA).getTime() - getDateTime(activityB).getTime();
        }
        return 0;
    });
  };

  const handleToggleEventExpansion = (eventId: string) => {
    setExpandedEventId(currentId => (currentId === eventId ? null : eventId));
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const dayEvents = getEventsForDate(selectedDate);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      <Calendar
        initialDate={trip.startDate}
        onDayPress={handleDayPress}
        markedDates={{
          [selectedDate]: {
            selected: true,
            selectedColor: colors.primary,
          },
        }}
        theme={{
          todayTextColor: colors.primary,
          selectedDayBackgroundColor: colors.primary,
          selectedDayTextColor: '#fff',
          dotColor: colors.primary,
          selectedDotColor: '#fff',
        }}
      />

      <View style={styles.eventsContainer}>
        <Text style={styles.dateHeader}>
          {selectedDate ? format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy') : 'Select a date'}
        </Text>

        {dayEvents.length === 0 ? (
          <Text style={styles.noEventsText}>No events on this day</Text>
        ) : (
          <View style={styles.eventsList}>
            {dayEvents.map(event => (
              <TouchableOpacity
                key={`${event.type}-${event.id}`}
                style={[styles.eventCard, { borderLeftColor: event.color }]}
                onPress={() => handleToggleEventExpansion(event.id)}
              >
                <View style={styles.eventHeader}>
                  <Text style={styles.eventType}>
                    {event.type === 'trip' ? 'Trip' : 'Activity'}
                  </Text>
                  {event.isBooked && <Text style={styles.bookedBadge}>✓ Booked</Text>}
                  {event.type === 'activity' && event.mood && (
                    <View style={[styles.moodBadge, { backgroundColor: event.color }]}>
                      <Text style={styles.moodText}>
                        {(event as CalendarEvent & { mood?: Activity['mood'] }).mood?.charAt(0).toUpperCase()}
                        {(event as CalendarEvent & { mood?: Activity['mood'] }).mood?.slice(1)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.eventTitle}>{event.title}</Text>
                {event.time && (
                  <Text style={styles.eventTime}>{event.time}</Text>
                )}
                {expandedEventId === event.id && (
                  <View style={styles.eventDetailsContainer}>
                    {event.description && <Text style={styles.eventDescription}>{event.description}</Text>}
                    {event.location && <Text style={styles.eventDetailText}>📍 {event.location}</Text>}
                    {(event as any).website && (
                      <TouchableOpacity onPress={(e) => {
                        e.stopPropagation();
                        openWebsiteUrl((event as any).website);
                      }}>
                        <Text style={styles.linkText}>🔗 Visit Website</Text>
                      </TouchableOpacity>
                    )}
                    {event.budget !== undefined && <Text style={styles.eventDetailText}>💰 ${event.budget.toFixed(2)}</Text>}
                    <TouchableOpacity onPress={(e) => {
                        e.stopPropagation();
                        const targetActivity = activities.find(a => a.id === event.id);
                        if (targetActivity) {
                            navigation.navigate('EditActivity', { activity: targetActivity });
                        }
                    }}>
                        <Text style={styles.editLink}>Edit Activity</Text>
                    </TouchableOpacity>
                  </View>
                )}
                 <Text style={styles.seeMoreText}>
                  {expandedEventId === event.id ? 'See Less' : 'See More'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  eventsContainer: {
    flex: 1,
    padding: 16,
  },
  dateHeader: {
    ...typography.h3,
    marginBottom: 16,
    color: colors.text,
  },
  noEventsText: {
    ...typography.body,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
  },
  eventsList: {
    flex: 1,
  },
  eventCard: {
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventType: {
    ...typography.caption,
    textTransform: 'uppercase',
  },
  eventTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  eventDate: {
    ...typography.body,
    color: colors.textSecondary,
  },
  eventTime: {
    ...typography.body,
    color: colors.textSecondary,
  },
  eventDetailsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  eventDescription: {
    ...typography.body,
    color: colors.text,
    marginBottom: 8,
  },
  eventDetailText: {
    ...typography.body,
    color: colors.text,
    marginBottom: 4,
  },
  linkText: {
    color: colors.primary,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  editLink: {
    ...typography.body,
    color: colors.primary,
    marginTop: 8,
    textAlign: 'right',
  },
  seeMoreText: {
    fontSize: 12,
    color: colors.primary,
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  moodBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  moodText: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '600',
  },
  bookedBadge: {
    backgroundColor: colors.success,
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
    marginLeft: 8,
  },
});
