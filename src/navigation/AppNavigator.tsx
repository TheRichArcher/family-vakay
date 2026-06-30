import React, { useEffect } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator, Button, Image } from 'react-native';
import { NavigatorScreenParams } from '@react-navigation/native';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import TripsScreen from '../screens/TripsScreen';
import CreateTripScreen from '../screens/CreateTripScreen';
import TripDetailScreen from '../screens/TripDetailScreen';
import EditTripScreen from '../screens/EditTripScreen';
import CreateActivityScreen from '../screens/CreateActivityScreen';
import EditActivityScreen from '../screens/EditActivityScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ReportScreen from '../screens/ReportScreen';
import KidsDashboardScreen from '../screens/KidsDashboardScreen';
import FamilyScreen from '../screens/FamilyScreen';
import FamilyCodeScreen from '../screens/FamilyCodeScreen';
import KidPinScreen from '../screens/KidPinScreen';
import QRScannerScreen from '../screens/QRScannerScreen';
import { Trip } from '../services/trips';
import { Activity } from '../services/activitiesService';
import ScavengerHuntScreen from '../screens/ScavengerHuntScreen';
import BedtimeStoryScreen from '../screens/BedtimeStoryScreen';
import LeaderboardScreen from '../screens/LeaderboardScreen';
import KidTripDetailScreen from '../screens/KidTripDetailScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminFamilyScreen from '../screens/AdminFamilyScreen';
import AdminManageTripsScreen from '../screens/AdminManageTripsScreen';
import AdminScavengerHuntScreen from '../screens/AdminScavengerHuntScreen';
import AdminManageTripActivitiesScreen from '../screens/AdminManageTripActivitiesScreen';
import ActivitySuggestionScreen from '../screens/ActivitySuggestionScreen';
import RewardsStoreScreen from '../screens/RewardsStoreScreen';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import * as Linking from 'expo-linking';

// Define Param Lists
export type AuthStackParamList = {
  Login: undefined;
  Register: { familyCode?: string };
  FamilyCode: undefined;
  KidPin: { familyId?: string, familyCode?: string };
  QRScanner: undefined;
};

export type TripsStackParamList = {
  TripsList: undefined;
  CreateTrip: undefined;
  TripDetail: { tripId: string; updatedFromEdit?: boolean };
  CreateActivity: { tripId: string };
  EditActivity: { activity: Activity };
  Calendar: { trip: Trip };
  Report: { tripId: string };
  Leaderboard: { tripId: string };
  ScavengerHunt: { tripId: string };
  ActivitySuggestion: { tripId: string };
};

export type KidDashboardStackParamList = {
  KidsDashboard: undefined;
  KidTripDetail: { tripId: string };
  BedtimeStory: { tripId: string };
  Leaderboard: { tripId: string };
  ScavengerHunt: { tripId: string };
  RewardsStore: undefined;
};

export type FamilyStackParamList = {
  Family: undefined;
};

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminFamily: undefined;
  AdminManageTrips: undefined;
  CreateTrip: undefined;
  AdminScavengerHunt: undefined;
  RewardsStore: undefined;
  AdminManageTripActivities: { tripId: string };
  CreateActivity: { tripId: string };
  EditActivity: { activity: Activity };
};

export type AppTabParamList = {
  KidDashboard: undefined;
  Trips: undefined;
  Family: NavigatorScreenParams<FamilyStackParamList>;
  Admin: NavigatorScreenParams<AdminStackParamList>;
};

export type RootStackParamList = {
  Auth: undefined;
  App: NavigatorScreenParams<AppTabParamList>;
  CreateTrip: undefined;
  EditTrip: { trip: Trip };
  // Modals or screens outside tabs
  BedtimeStory: { tripId: string };
  QRScanner: { mode?: 'family' | 'trip' } | undefined;
};

export type AppNavigatorParamList = AuthStackParamList & TripsStackParamList & KidDashboardStackParamList & FamilyStackParamList & AdminStackParamList & AppTabParamList & RootStackParamList;

// Navigators
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();
const TripsStackNav = createNativeStackNavigator<TripsStackParamList>();
const KidDashboardStack = createNativeStackNavigator<KidDashboardStackParamList>();
const FamilyStackNav = createNativeStackNavigator<FamilyStackParamList>();
const AdminStackNav = createNativeStackNavigator<AdminStackParamList>();
const AppTab = createBottomTabNavigator<AppTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();


const SplashScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
    <ActivityIndicator size="large" color={colors.primary} />
  </View>
);

const LogoTitle = () => (
  <Image
    source={require('../../assets/family-vakay-logo.png')}
    resizeMode="contain"
    style={{ width: 180, height: 40 }}
  />
);

const SignOutButton = () => {
  const { signOut } = useAuth();
  return <Button onPress={signOut} title="Sign Out" color={colors.primary} />;
};


// Stacks for each tab
const TripsStack = () => (
  <TripsStackNav.Navigator screenOptions={{ headerTitle: () => <LogoTitle />, headerRight: () => <SignOutButton /> }}>
    <TripsStackNav.Screen name="TripsList" component={TripsScreen} options={{ title: 'My Trips' }} />
    <TripsStackNav.Screen name="CreateTrip" component={CreateTripScreen} options={{ title: 'Create a New Trip' }} />
    <TripsStackNav.Screen name="TripDetail" component={TripDetailScreen} />
    <TripsStackNav.Screen name="CreateActivity" component={CreateActivityScreen} options={{ title: 'Add an Activity' }} />
    <TripsStackNav.Screen name="EditActivity" component={EditActivityScreen} options={{ title: 'Edit Activity' }} />
    <TripsStackNav.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
    <TripsStackNav.Screen name="Report" component={ReportScreen} options={{ title: 'Trip Report' }} />
    <TripsStackNav.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
    <TripsStackNav.Screen name="ScavengerHunt" component={ScavengerHuntScreen} options={{ title: 'Scavenger Hunt' }} />
    <TripsStackNav.Screen name="ActivitySuggestion" component={ActivitySuggestionScreen} options={{ title: 'Activity Suggestions' }} />
  </TripsStackNav.Navigator>
);

const KidDashboardNavigator = () => (
  <KidDashboardStack.Navigator screenOptions={{ headerTitle: () => <LogoTitle />, headerRight: () => <SignOutButton /> }}>
    <KidDashboardStack.Screen name="KidsDashboard" component={KidsDashboardScreen} options={{ title: 'My Dashboard' }}/>
    <KidDashboardStack.Screen name="KidTripDetail" component={KidTripDetailScreen} />
    <KidDashboardStack.Screen name="BedtimeStory" component={BedtimeStoryScreen} options={{ title: 'Bedtime Story Creator' }} />
    <KidDashboardStack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
    <KidDashboardStack.Screen name="ScavengerHunt" component={ScavengerHuntScreen} options={{ title: 'Scavenger Hunt' }} />
    <KidDashboardStack.Screen name="RewardsStore" component={RewardsStoreScreen} options={{ title: 'Rewards Store' }} />
  </KidDashboardStack.Navigator>
);

const FamilyNavigator = () => (
    <FamilyStackNav.Navigator screenOptions={{ headerTitle: () => <LogoTitle />, headerRight: () => <SignOutButton /> }}>
        <FamilyStackNav.Screen name="Family" component={FamilyScreen} options={{ title: 'Manage Family' }} />
    </FamilyStackNav.Navigator>
)

const AdminStack = () => (
  <AdminStackNav.Navigator screenOptions={{ headerTitle: () => <LogoTitle />, headerRight: () => <SignOutButton /> }}>
    <AdminStackNav.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Admin Dashboard' }} />
    <AdminStackNav.Screen name="AdminFamily" component={AdminFamilyScreen} options={{ title: 'Manage Family' }} />
    <AdminStackNav.Screen name="AdminManageTrips" component={AdminManageTripsScreen} options={{ title: 'Manage Trips' }} />
    <AdminStackNav.Screen name="CreateTrip" component={CreateTripScreen} options={{ title: 'Create a New Trip' }} />
    <AdminStackNav.Screen name="AdminScavengerHunt" component={AdminScavengerHuntScreen} options={{ title: 'Scavenger Hunt' }} />
    <AdminStackNav.Screen name="RewardsStore" component={RewardsStoreScreen} options={{ title: 'Rewards Store' }} />
    <AdminStackNav.Screen name="AdminManageTripActivities" component={AdminManageTripActivitiesScreen} options={{ title: 'Manage Activities' }} />
    <AdminStackNav.Screen name="CreateActivity" component={CreateActivityScreen} options={{ title: 'Add an Activity' }} />
    <AdminStackNav.Screen name="EditActivity" component={EditActivityScreen} options={{ title: 'Edit Activity' }} />
  </AdminStackNav.Navigator>
);

// Main Tab Navigator
const AppTabs = () => {
    const { user } = useAuth();
    const isKid = user?.role === 'kid';
    const isAdmin = user?.role === 'admin';

    return (
        <AppTab.Navigator screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
                let iconName;
                if (route.name === 'KidDashboard') {
                    iconName = focused ? 'home' : 'home-outline';
                } else if (route.name === 'Trips') {
                    iconName = focused ? 'map' : 'map-outline';
                } else if (route.name === 'Family') {
                    iconName = focused ? 'people' : 'people-outline';
                } else if (route.name === 'Admin') {
                    iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
                }
                return <Ionicons name={iconName as any} size={size} color={color} />;
            },
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        })}>
            {isKid ? (
                <AppTab.Screen name="KidDashboard" component={KidDashboardNavigator} options={{ title: 'Dashboard' }} />
            ) : (
                <>
                    <AppTab.Screen name="Trips" component={TripsStack} options={{ title: 'Trips' }}/>
                    <AppTab.Screen name="Family" component={FamilyNavigator} options={{ title: 'My Family' }} />
                    {isAdmin && (
                         <AppTab.Screen name="Admin" component={AdminStack} options={{ title: 'Admin' }} />
                    )}
                </>
            )}
        </AppTab.Navigator>
    )
};


// Auth Navigator
const AuthStack = () => (
  <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
    <AuthStackNav.Screen name="Login" component={LoginScreen} />
    <AuthStackNav.Screen name="Register" component={RegisterScreen} />
    <AuthStackNav.Screen name="FamilyCode" component={FamilyCodeScreen} />
    <AuthStackNav.Screen name="KidPin" component={KidPinScreen} />
    <AuthStackNav.Screen name="QRScanner" component={QRScannerScreen} />
  </AuthStackNav.Navigator>
);

// Final App Navigator
export default function AppNavigator() {
  const { user, authInitializing, signOut } = useAuth();
  const url = Linking.useURL();

  useEffect(() => {
    if (url && user) {
      const { path } = Linking.parse(url);
      // If the user is trying to access the kid login route while
      // already logged in, we need to sign them out first.
      if (path === 'join') {
        signOut();
      }
    }
  }, [url, user, signOut]);

  if (authInitializing) {
    return <SplashScreen />;
  }

  return (
    <RootStack.Navigator>
    {user ? (
        <>
        <RootStack.Screen name="App" component={AppTabs} options={{ headerShown: false }} />
        {/* Add Modals here so they can be called from anywhere */}
        <RootStack.Screen name="CreateTrip" component={CreateTripScreen} options={{ title: 'Create a New Trip', presentation: 'modal' }} />
        <RootStack.Screen name="EditTrip" component={EditTripScreen} options={{ title: 'Edit Trip', presentation: 'modal' }} />
        <RootStack.Screen name="QRScanner" component={QRScannerScreen} options={{ title: 'Scan QR Code' }} />
        </>
    ) : (
        <RootStack.Screen name="Auth" component={AuthStack} options={{ headerShown: false }} />
    )}
    </RootStack.Navigator>
  );
};
