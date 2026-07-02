import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation, CompositeNavigationProp, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AdminStackParamList, RootStackParamList } from '../navigation/AppNavigator';
import { TripWithBudget, tripsService } from '../services/trips';
import { colors } from '../theme/colors';
import ScreenHeader from '../components/ScreenHeader';
import { typography } from '../theme/typography';
import { BudgetStatus } from '../components/BudgetStatus';
import { userService, AdminStats } from '../services/userService';

type AdminDashboardNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<AdminStackParamList, 'AdminDashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const AdminDashboardScreen = () => {
  const { user } = useAuth();
  const navigation = useNavigation<AdminDashboardNavigationProp>();
  const [tripsWithBudgets, setTripsWithBudgets] = useState<TripWithBudget[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadTripBudgets = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [tripsWithSpent, stats] = await Promise.all([
        tripsService.getTripsWithBudgetSummary(),
        userService.getAdminStats(),
      ]);
      setTripsWithBudgets(tripsWithSpent);
      setAdminStats(stats);
    } catch (error) {
      console.error("Failed to load trip budgets:", error);
      Alert.alert("Error", "Could not load trip budget information.");
    } finally {
      setIsLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadTripBudgets();
    }, [user])
  );


  return (
    <ScrollView style={styles.container}>
      <ScreenHeader title="Admin Dashboard" subtitle={`Welcome, ${user?.displayName || 'Admin'}!`} background="band" />

      {!isLoading && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Setup Checklist</Text>
          <View style={styles.checklist}>
            <TouchableOpacity style={styles.checkItem} onPress={() => navigation.navigate('AdminFamily')}>
              <Ionicons name={adminStats && adminStats.family_members > 1 ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={colors.primary} />
              <Text style={styles.checkText}>Invite another adult or add kid profiles</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.checkItem} onPress={() => navigation.navigate('CreateTrip')}>
              <Ionicons name={tripsWithBudgets.length > 0 ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={colors.primary} />
              <Text style={styles.checkText}>Create the first trip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.checkItem} onPress={() => navigation.navigate('RewardsStore')}>
              <Ionicons name="ellipse-outline" size={22} color={colors.primary} />
              <Text style={styles.checkText}>Add rewards kids can spend points on</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip Budgets Overview</Text>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : tripsWithBudgets.length > 0 ? (
          tripsWithBudgets.map(trip => (
            <View key={trip.id} style={styles.tripBudgetCard}>
              <Text style={styles.tripName}>{trip.name}</Text>
              <BudgetStatus budget={trip.budget || 0} totalSpent={trip.totalSpent} />
              <TouchableOpacity style={styles.budgetButton} onPress={() => navigation.navigate('BudgetCommandCenter', { tripId: trip.id })}>
                <Ionicons name="wallet-outline" size={18} color={colors.white} />
                <Text style={styles.budgetButtonText}>Open Budget</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.noTripsText}>No trips with budgets found.</Text>
        )}
      </View>

      <View style={styles.menuContainer}>
        <Text style={styles.sectionTitle}>Admin Tools</Text>
        <View style={styles.menuGrid}>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminFamily')}>
            <Ionicons name="people-circle" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>Manage Family</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminManageTrips')}>
            <Ionicons name="map-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>Manage Trips</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('CreateTrip')}>
            <Ionicons name="add-circle-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>Create a New Trip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('AdminScavengerHunt')}>
            <Ionicons name="search-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>Scavenger Hunt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('RewardsStore')}>
            <Ionicons name="gift-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>Rewards Store</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Coming Soon!', 'This feature is not yet available.')}>
            <Ionicons name="analytics-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>View Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => Alert.alert('Coming Soon!', 'This feature is not yet available.')}>
            <Ionicons name="settings-outline" size={28} color={colors.primary} />
            <Text style={styles.menuItemText}>App Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  
  section: {
    margin: 20,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 15,
  },
  checklist: {
    backgroundColor: colors.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  checkItem: {
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  tripBudgetCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tripName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  noTripsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 20,
    fontSize: 16,
  },
  budgetButton: {
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  budgetButtonText: {
    ...typography.button,
    color: colors.white,
  },
  menuContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuItem: {
    backgroundColor: 'white',
    width: '48%', // Two columns
    alignItems: 'center',
    paddingVertical: 25,
    paddingHorizontal: 15,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  menuItemText: {
    ...typography.body,
    color: colors.text,
    marginTop: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default AdminDashboardScreen;
