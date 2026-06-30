import { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { RootStackParamList } from './AppNavigator';
import { env } from '../config/env';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), env.DEEPLINK_BASE_URL].filter(Boolean) as string[],
  config: {
    screens: {
      Auth: {
        screens: {
          Login: 'login',
          Register: 'register',
          FamilyCode: 'family-code',
          KidPin: 'join',
          QRScanner: 'qr-scanner',
        },
      },
      App: {
        screens: {
          KidDashboard: {
            screens: {
              KidsDashboard: 'dashboard',
              KidTripDetail: 'kid-trip/:tripId',
              BedtimeStory: 'kid-trip/:tripId/bedtime-story',
              Leaderboard: 'kid-trip/:tripId/leaderboard',
              ScavengerHunt: 'kid-trip/:tripId/scavenger-hunt',
            },
          },
          Trips: {
            screens: {
              TripsList: 'trips',
              TripDetail: 'trip/:tripId',
              CreateActivity: 'trip/:tripId/add-activity',
              EditActivity: 'edit-activity',
              Calendar: 'calendar',
              Report: 'report',
              Leaderboard: 'leaderboard',
              ScavengerHunt: 'scavenger-hunt',
              ActivitySuggestion: 'trip/:tripId/suggestions',
            },
          },
          Family: {
            screens: {
              Family: 'family',
            },
          },
          Admin: {
            screens: {
              AdminDashboard: 'admin',
              AdminFamily: 'admin/family',
              AdminManageTrips: 'admin/trips',
              AdminScavengerHunt: 'admin/scavenger-hunt',
              AdminManageTripActivities: 'admin/trips/:tripId/activities',
              CreateActivity: 'admin/trips/:tripId/add-activity',
              EditActivity: 'admin/edit-activity',
            },
          },
        },
      },
      CreateTrip: 'create-trip',
      EditTrip: 'edit-trip',
      BedtimeStory: 'bedtime-story/:tripId',
      QRScanner: 'qr-scanner',
    },
  },
};

export default linking;
