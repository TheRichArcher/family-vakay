import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { AuthProvider } from './contexts/AuthContext';
import AppNavigator, { RootStackParamList } from './navigation/AppNavigator';
import { enableScreens } from 'react-native-screens';
import { ActivityIndicator } from 'react-native';
import { colors } from './theme/colors';
import { initMonitoring, addBreadcrumb } from './monitoring';
import linking from './navigation/linking';

// Enable screens for better performance
enableScreens();

// Increase stack trace limit for better error messages
Error.stackTraceLimit = 100;

export default function App() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  useEffect(() => {
    initMonitoring();
  }, []);

  return (
    <NavigationContainer
      linking={linking}
      fallback={<ActivityIndicator color={colors.primary} size="large" />}
      ref={navigationRef}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        addBreadcrumb({
          category: 'navigation',
          message: `Navigated to ${route?.name}`,
          level: 'info',
          data: route?.params ? { params: route.params as any } : undefined,
        });
      }}
    >
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </NavigationContainer>
  );
}
