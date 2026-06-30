import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AuthStackParamList, TripsStackParamList } from '../navigation/AppNavigator';
import { userService } from '../services/userService';
import { colors } from '../theme/colors';
import { tripsService } from '../services/trips';
import { useAuth } from '../contexts/AuthContext';

type AuthNav = NativeStackNavigationProp<AuthStackParamList>;
type TripsNav = NativeStackNavigationProp<TripsStackParamList>;
type QRScannerNavigationProp = AuthNav & TripsNav;

export default function QRScannerScreen() {
  const navigation = useNavigation<QRScannerNavigationProp>();
  const route = useRoute() as any;
  const { user } = useAuth();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mode: 'family' | 'trip' = (route.params as any)?.mode || 'family';

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      if (!isMounted) return;
      setHasPermission(status === 'granted');
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleFamilyCode = useCallback(async (familyCode: string) => {
    try {
      const { familyId } = await userService.getFamilyIdByShareCode(
        familyCode.replace(/\s/g, '').toUpperCase()
      );
      if (familyId) {
        navigation.replace('KidPin', { familyId });
      } else {
        setError("That family code wasn't found. Please check it and try again.");
        setIsScanning(true);
      }
    } catch (e) {
      setError('Could not verify the family code. It might be incorrect.');
      setIsScanning(true);
    }
  }, [navigation]);

  const handleTripCode = useCallback(async (tripCode: string) => {
    try {
      const trimmed = (tripCode || '').trim();
      const trip = await tripsService.getTripByCode(trimmed);
      if (!trip) {
        setError('No trip found with that code.');
        setIsScanning(true);
        return;
      }
      if (!user?.uid) {
        setError('You must be signed in to join a trip.');
        setIsScanning(true);
        return;
      }
      if (trip.participants.includes(user.uid) || trip.ownerId === user.uid) {
        // Already joined; just close
        navigation.goBack();
        return;
      }
      const updatedParticipants = [...trip.participants, user.uid];
      await tripsService.updateTrip(trip.id, { participants: updatedParticipants });
      navigation.goBack();
    } catch (e) {
      setError('Could not join the trip. Please try again.');
      setIsScanning(true);
    }
  }, [navigation, user?.uid]);

  const handleBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    if (!isScanning) return;
    setIsScanning(false);
    setError(null);

    try {
      // Accept either a full URL with familyCode/vacationCode param or a raw code
      let familyCode: string | null = null;
      let tripCode: string | null = null;
      try {
        const url = new URL(data);
        familyCode = url.searchParams.get('familyCode');
        tripCode = url.searchParams.get('vacationCode');
      } catch {
        // Not a URL, maybe a raw code
        const maybeCode = (data || '').trim();
        // Heuristic: prefer family if 6-char, otherwise try as trip
        if (maybeCode.length === 6) familyCode = maybeCode;
        else if (maybeCode.length > 0) tripCode = maybeCode;
      }

      const desiredMode = mode;
      if (desiredMode === 'family' && familyCode) {
        handleFamilyCode(familyCode);
      } else if (desiredMode === 'trip' && tripCode) {
        handleTripCode(tripCode);
      } else if (familyCode) {
        handleFamilyCode(familyCode);
      } else if (tripCode) {
        handleTripCode(tripCode);
      } else {
        setError("This QR code doesn't seem to be a valid family invite.");
        setIsScanning(true);
      }
    } catch {
      setError('Failed to process the scanned code.');
      setIsScanning(true);
    }
  }, [handleFamilyCode, handleTripCode, isScanning, mode]);

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.info}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.subtitle}>
          We need camera access to scan the QR. You can still enter the code manually.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryButtonText}>Enter Code Manually</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.scannerContainer}>
        <BarCodeScanner
          onBarCodeScanned={isScanning ? handleBarCodeScanned : undefined}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.overlay} />
        <View style={styles.scanFrame} />
      </View>
      <View style={styles.bottomPanel}>
        <Text style={styles.subtitle}>Align the QR code within the frame</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!isScanning && (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsScanning(true)}>
            <Text style={styles.secondaryButtonText}>Scan Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.linkButton} onPress={() => navigation.goBack()}>
          <Text style={styles.linkButtonText}>Enter Code Manually</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  bottomPanel: {
    padding: 16,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  info: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginTop: 10,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    backgroundColor: Platform.select({ ios: '#efefef', android: '#e9e9e9', default: '#efefef' }),
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 8,
    alignItems: 'center',
  },
  linkButtonText: {
    color: colors.primary,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
});


