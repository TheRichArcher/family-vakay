import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { tripsService, Trip } from '../services/trips';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { KidDashboardStackParamList } from '../navigation/AppNavigator';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

type KidsDashboardNavigationProp = NativeStackNavigationProp<KidDashboardStackParamList, 'KidsDashboard'>;

export default function KidsDashboardScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation<KidsDashboardNavigationProp>();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={signOut} style={{ marginRight: 15 }}>
            <Ionicons name="log-out-outline" size={24} color={colors.error} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, signOut]);

  useEffect(() => {
    if (user && 'uid' in user) {
      tripsService.getTripsForParticipant(user.uid)
        .then(setTrips)
        .catch((err: any) => console.error("Failed to fetch trips for kid:", err))
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.displayName || 'Explorer'}!</Text>

      <Text style={styles.tripsTitle}>My Trips</Text>
      {trips.length > 0 ? (
        trips.map((item) => (
          <TouchableOpacity 
            key={item.id}
            style={styles.tripCard} 
            onPress={() => navigation.navigate('KidTripDetail', { tripId: item.id })}
          >
            <Text style={styles.tripName}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={24} color="#ccc" style={styles.tripArrow} />
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.noTripsText}>You're not on any trips yet!</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.background,
  },
  title: {
    ...typography.h1,
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 15,
    padding: 16,
    marginBottom: 25,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  storyButton: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  storyButtonIcon: {
    marginRight: 16,
  },
  storyButtonTitle: {
    ...typography.h3,
    color: colors.textLight,
  },
  storyButtonText: {
    ...typography.body,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  tripsTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  tripCard: {
    backgroundColor: colors.white,
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripName: {
    ...typography.h3,
    color: colors.text
  },
  tripArrow: {

  },
  noTripsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
  },
  scavengerHuntToggleButton: {
    backgroundColor: colors.accent,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
    marginHorizontal: 10,
  },
  scavengerHuntToggleButtonText: {
    ...typography.button,
    color: colors.textLight,
  },
  scavengerHuntContainer: {
    backgroundColor: colors.white,
    borderRadius: 15,
    padding: 20,
    marginHorizontal: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
}); 