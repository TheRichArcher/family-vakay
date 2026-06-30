import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { UserProfile, userService } from '../services/userService';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';

type KidPinScreenRouteProp = RouteProp<AuthStackParamList, 'KidPin'>;
type KidPinNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export default function KidPinScreen() {
  const route = useRoute<KidPinScreenRouteProp>();
  const navigation = useNavigation<KidPinNavigationProp>();
  const { loginKid } = useAuth();
  
  // The screen can receive either familyId directly, or a familyCode from a deep link
  const params = route.params as { familyId?: string, familyCode?: string };

  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [selectedKid, setSelectedKid] = useState<UserProfile | null>(null);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      let finalFamilyId: string | undefined = undefined;

      // Determine the familyId
      if (params.familyId) {
        finalFamilyId = params.familyId;
      } else if (params.familyCode) {
        try {
          const { familyId } = await userService.getFamilyIdByShareCode(params.familyCode);
          if (familyId) {
            finalFamilyId = familyId;
          } else {
            setError("Could not verify the family code. It might be incorrect.");
          }
        } catch (err) {
          console.error("Error fetching familyId from share code:", err);
          setError("Could not verify the family code. It might be incorrect.");
        }
      }

      // If we have a familyId, fetch the members
      if (finalFamilyId) {
        try {
          // Store the familyId for future logins
          await AsyncStorage.setItem('lastFamilyId', finalFamilyId);

          const response = await apiClient.get(`/api/v1/family/${finalFamilyId}/public_members`);
          const kids = response.data.filter((member: UserProfile) => member.role === 'kid');
          setFamilyMembers(kids);
          if (kids.length === 0) {
            setError("No kids were found for this family. An adult needs to create a kid profile first.");
          }
        } catch (err) {
          console.error('Failed to fetch kids:', err);
          setError("Could not load family data. Please try again later.");
        }
      } else if (!params.familyCode) {
        // Only show this error if we didn't start with a familyCode flow
        setError("No family information was provided.");
      }
      
      setIsLoading(false);
    };

    fetchData();
  }, [route.params]);

  const handleLogin = async () => {
    setError(null);
    if (!selectedKid || !pin) {
      setError("Please select a user and enter a PIN.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }

    try {
      const response = await apiClient.post('/api/v1/family/kid/login', {
        uid: selectedKid.uid,
        pin: pin,
      });
      const { access_token } = response.data;
      await loginKid(access_token);
      // Navigation will be handled by the AuthProvider's onAuthStateChanged effect
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        if (error.response.status === 401) {
          setError("Incorrect PIN.");
        } else {
          setError(error.response.data.detail || "Could not log you in. Please try again.");
        }
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    }
  };

  if (isLoading) {
    return <View style={styles.container}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const FormContainer = Platform.OS === 'web' ? 'form' as any : View;

  if (!selectedKid) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Who are you?</Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <FlatList
          data={familyMembers}
          keyExtractor={(item) => item.uid}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.profileButton} onPress={() => setSelectedKid(item)}>
              <Text style={styles.profileButtonText}>{item.name}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={!error ? <Text>No kids found in this family.</Text> : null}
        />
        <TouchableOpacity onPress={() => {
          AsyncStorage.removeItem('lastFamilyId');
          navigation.navigate('FamilyCode');
        }}>
          <Text style={styles.backLink}>Not your family? Change code.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FormContainer style={styles.container}>
      <Text style={styles.title}>Hi, {selectedKid.name}!</Text>
      <Text style={styles.subtitle}>Enter your 4-digit PIN</Text>
      <TextInput
        style={styles.input}
        value={pin}
        onChangeText={setPin}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        autoFocus
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setSelectedKid(null)}>
        <Text style={styles.backLink}>Not you? Go back.</Text>
      </TouchableOpacity>
    </FormContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: colors.text },
  subtitle: { fontSize: 18, textAlign: 'center', marginBottom: 10, color: colors.textSecondary },
  input: { borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 8, marginBottom: 20, textAlign: 'center', fontSize: 18, backgroundColor: colors.white },
  button: { backgroundColor: colors.primary, padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: colors.white, fontWeight: 'bold' },
  profileButton: { backgroundColor: colors.white, padding: 20, borderRadius: 8, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  profileButtonText: { fontSize: 18, fontWeight: '600', color: colors.text },
  backLink: { textAlign: 'center', color: colors.link, marginTop: 20 },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 10,
  },
}); 