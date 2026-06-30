import React, { useState, useEffect } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getErrorMessage } from '../utils/errorUtils';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import BrandLogo from '../components/BrandLogo';

type LoginScreenNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

export default function LoginScreen() {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const { signInWithEmail, forgotPassword, user, isLoading, error: authError } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (authError) {
      setError(getErrorMessage(authError));
    }
  }, [authError]);

  useEffect(() => {
    // This effect can be simplified or removed if profile completion is handled elsewhere
    if (user) {
        // Assuming navigation to the main app happens automatically when user is set in AuthContext
        // If not, you would navigate here.
        // The check for `!user.name` to navigate to register is now part of the registration flow, not login.
    }
  }, [user, navigation]);

  const handleLogin = async () => {
    setError(null);
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    try {
      await signInWithEmail(email, password);
      // onAuthStateChanged in AuthContext will handle navigation if login is successful
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setSuccessMessage(null);
    if (!email) {
      setError("Please enter your email address to reset your password.");
      return;
    }
    try {
      await forgotPassword(email);
      setSuccessMessage("Password reset email sent. Please check your inbox.");
    } catch (err: any) {
      setError(getErrorMessage(err));
    }
  };

  const handleKidLogin = async () => {
    try {
      const familyId = await AsyncStorage.getItem('lastFamilyId');
      if (familyId) {
        navigation.navigate('KidPin', { familyId });
      } else {
        navigation.navigate('FamilyCode');
      }
    } catch (e) {
      console.error("Failed to get familyId from storage", e);
      navigation.navigate('FamilyCode');
    }
  };

  return (
    <View style={styles.container}>
        <BrandLogo size="lg" style={{ marginBottom: 20 }} />
        <>
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
          <TouchableOpacity
            style={[styles.button, styles.loginButton, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
          </TouchableOpacity>
        </>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {successMessage && <Text style={styles.successText}>{successMessage}</Text>}

      <TouchableOpacity
        style={styles.link}
        onPress={() => navigation.navigate('Register', {})}
        disabled={isLoading}
      >
        <Text style={styles.linkText}>Don't have an account? Register</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={handleForgotPassword}
        disabled={isLoading}
      >
        <Text style={styles.linkText}>Forgot Password?</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.kidLoginButton, isLoading && styles.buttonDisabled]}
        onPress={handleKidLogin}
        disabled={isLoading}
      >
        <Text style={styles.kidLoginButtonText}>Kid's Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
    ...typography.body,
    backgroundColor: colors.white,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: colors.disabled,
  },
  loginButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    ...typography.button,
    color: colors.white,
  },
  link: {
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
  },
  linkText: {
    color: colors.link,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 10,
  },
  successText: {
    color: colors.success,
    textAlign: 'center',
    marginBottom: 10,
  },
  kidLoginButton: {
    backgroundColor: colors.white,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  kidLoginButtonText: {
    ...typography.button,
    color: colors.primary,
    textAlign: 'center',
  },
});
