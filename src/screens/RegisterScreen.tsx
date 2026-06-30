import React, { useState, useEffect } from 'react';
import {
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/errorUtils';
import { useRoute, RouteProp } from '@react-navigation/native';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { colors } from '../theme/colors';
import { Picker } from '@react-native-picker/picker';

type RegisterScreenRouteProp = RouteProp<AuthStackParamList, 'Register'>;

export default function RegisterScreen() {
  const { registerWithEmail, isLoading, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'kid'>('member');
  const [error, setError] = useState<string | null>(null);
  const route = useRoute<RegisterScreenRouteProp>();

  useEffect(() => {
    // If a familyId is passed from the join link/flow, pre-fill it.
    if (route.params?.familyCode) {
      setFamilyId(route.params.familyCode);
    }
  }, [route.params?.familyCode]);

  useEffect(() => {
    if (authError) {
      setError(getErrorMessage(authError));
    }
  }, [authError]);

  const handleRegister = async () => {
    setError(null);
    if (!name || !email || !password || !confirmPassword) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await registerWithEmail(email, password, name, familyId, familyId ? role : undefined);
      // AppNavigator will handle the switch to the main app stack.
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Your Account</Text>
      <Text style={styles.subtitle}>
        Join your family or start a new one.
      </Text>
      
      <TextInput
        style={styles.input}
        placeholder="Your Name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        editable={!isLoading}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!isLoading}
      />
      
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!isLoading}
      />
      <Text style={styles.helperText}>Password must be at least 6 characters.</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!isLoading}
      />

      <TextInput
        style={styles.input}
        placeholder="Family Code (optional)"
        value={familyId}
        onChangeText={setFamilyId}
        autoCapitalize="characters"
        editable={!isLoading}
      />

      {familyId ? (
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={role}
            onValueChange={(itemValue) => setRole(itemValue)}
            style={styles.picker}
          >
            <Picker.Item label="Member" value="member" />
            {/* Add other roles here as they become available */}
          </Picker>
        </View>
      ) : null}


      {error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Register</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: colors.white,
  },
  pickerContainer: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 15,
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  picker: {
    height: '100%',
    width: '100%',
  },
  helperText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'left',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  button: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 10,
  },
}); 