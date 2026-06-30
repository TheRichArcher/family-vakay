import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, 
  TextInput
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { tripsService, Trip } from '../services/trips';
import { useFocusEffect } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { aiService } from '../services/aiService';
import { Challenge, activitiesService, ActivityData, Activity } from '../services/activitiesService';

export default function AdminScavengerHuntScreen() {
  const { user, authInitializing } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!user?.uid) {
      setTrips([]);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const userTrips = await tripsService.getTrips(user.uid);

      if (userTrips && Array.isArray(userTrips)) {
        setTrips(userTrips);
      } else {
        setTrips([]);
      }
    } catch (err) {
      console.error('AdminScavengerHuntScreen: Error loading trips:', err);
      setTrips([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  useFocusEffect(
    useCallback(() => {
      if (!authInitializing && user?.uid) {
        loadTrips();
      }
    }, [authInitializing, user?.uid, loadTrips])
  );
  
  const handleGenerateHunt = async () => {
    if (!selectedTrip) return;
    setIsGenerating(true);
    try {
      const updatedActivities: Activity[] = await aiService.generateHunt(selectedTrip.id);
      
      // The API returns the full list of updated activities. We need to find the one
      // that corresponds to our selected trip and extract its challenges.
      // This assumes we are generating for one trip's activities at a time.
      if (updatedActivities && updatedActivities.length > 0) {
        // For simplicity, let's find the first activity that now has challenges.
        // A more robust solution might match on an activity ID if one were selected.
        const anActivityWithChallenges = updatedActivities.find(act => act.challenges && act.challenges.length > 0);
        if (anActivityWithChallenges && anActivityWithChallenges.challenges) {
          setChallenges(anActivityWithChallenges.challenges);
        } else {
          // It's possible the AI returned no challenges for any activity
          setChallenges([]);
        }
      } else {
        setChallenges([]);
      }
    } catch (error) {
        console.error('Failed to generate scavenger hunt:', error);
        // Handle error display to the user, e.g., using an Alert
    } finally {
        setIsGenerating(false);
    }
  };

  const handleChallengeTextChange = (text: string, index: number) => {
    const newChallenges = [...challenges];
    newChallenges[index].text = text;
    setChallenges(newChallenges);
  };

  const handleSaveHunt = async () => {
    if (!selectedTrip) return;

    const activityData: ActivityData = {
      name: `${selectedTrip.name} Scavenger Hunt`,
      tripId: selectedTrip.id,
      isIdea: false,
      isBooked: true,
      challenges: challenges,
      activityTypes: ['Scavenger Hunt'],
    };

    try {
        await activitiesService.createActivity(activityData);
        // navigate back or show success message
    } catch (error) {
        console.error('Failed to save scavenger hunt:', error);
    }
  };

  const renderTripItem = ({ item }: { item: Trip }) => (
    <TouchableOpacity 
        style={[styles.tripCard, selectedTrip?.id === item.id && styles.selectedTripCard]}
        onPress={() => setSelectedTrip(item)}
    >
      <Text style={styles.tripName}>{item.name}</Text>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!selectedTrip ? (
        <>
            <Text style={styles.title}>Select a Trip</Text>
            <FlatList
                data={trips}
                keyExtractor={(item) => item.id}
                renderItem={renderTripItem}
                ListEmptyComponent={<Text style={styles.noTripsText}>No trips found.</Text>}
            />
        </>
      ) : (
        <View>
            <Text style={styles.title}>{selectedTrip.name}</Text>
            <TouchableOpacity style={styles.button} onPress={handleGenerateHunt} disabled={isGenerating}>
                <Text style={styles.buttonText}>{isGenerating ? 'Generating...' : 'Generate with AI'}</Text>
            </TouchableOpacity>
            {challenges && challenges.map((challenge, index) => (
                <TextInput
                    key={index}
                    style={styles.challengeInput}
                    value={challenge.text}
                    onChangeText={(text) => handleChallengeTextChange(text, index)}
                    placeholder={`Challenge ${index + 1}`}
                />
            ))}
            {challenges && challenges.length > 0 && (
                <TouchableOpacity style={styles.button} onPress={handleSaveHunt}>
                    <Text style={styles.buttonText}>Save Hunt</Text>
                </TouchableOpacity>
            )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  tripCard: {
    padding: 20,
    marginVertical: 8,
    backgroundColor: colors.white,
    borderRadius: 8,
  },
  selectedTripCard: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  tripName: {
    fontSize: 18,
  },
  noTripsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
  },
  button: {
      backgroundColor: colors.primary,
      padding: 15,
      borderRadius: 8,
      alignItems: 'center',
      marginVertical: 10,
  },
  buttonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: 'bold',
  },
  challengeInput: {
      backgroundColor: colors.white,
      padding: 10,
      borderRadius: 5,
      marginVertical: 5,
  }
}); 
