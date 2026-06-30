import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { userService } from '../services/userService';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../navigation/AppNavigator';
import { colors } from '../theme/colors';

type FamilyCodeNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'FamilyCode'>;

export default function FamilyCodeScreen() {
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigation = useNavigation<FamilyCodeNavigationProp>();
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);

    useEffect(() => {
        if (Platform.OS !== 'web' || scannerRef.current) {
            return;
        }

        const scanner = new Html5QrcodeScanner(
            'qr-reader',
            {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
            },
            false // verbose
        );

        const onScanSuccess = (decodedText: string, decodedResult: any) => {
            scanner.clear();
            const url = new URL(decodedText);
            const familyCode = url.searchParams.get('familyCode');
            if (familyCode) {
                setCode(familyCode);
                handleCodeSubmit(familyCode);
            } else {
                setError("This QR code doesn't seem to be a valid family invite.");
            }
        };

        const onScanFailure = (error: any) => {
            // This will fire frequently, so we don't log it unless we need to debug.
            // console.warn(`Code scan error = ${error}`);
        };

        scanner.render(onScanSuccess, onScanFailure);
        scannerRef.current = scanner;

        return () => {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(error => {
                    console.error("Failed to clear html5-qrcode-scanner.", error);
                });
                scannerRef.current = null;
            }
        };
    }, []);

    const handleCodeSubmit = async (submitCode?: string) => {
        const codeToSubmit = (submitCode || code).replace(/\s/g, '').toUpperCase();
        setError(null);
        if (!codeToSubmit) {
            setError("Please enter your 6-character family code.");
            return;
        }
        setIsLoading(true);
        try {
            const { familyId } = await userService.getFamilyIdByShareCode(codeToSubmit);
            if (familyId) {
                navigation.navigate('KidPin', { familyId });
            } else {
                setError("That family code wasn't found. Please check it and try again.");
            }
        } catch (error) {
            console.error(error);
            setError("Could not verify the family code. It might be incorrect.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Ionicons name="people-circle-outline" size={80} color={colors.primary} style={{ marginBottom: 20 }} />
            <Text style={styles.title}>Enter Family Code</Text>
            <Text style={styles.subtitle}>
                Your parent can show you the 6-character code from their app.
            </Text>

            <TextInput
                style={styles.input}
                placeholder="ABCDEF"
                value={code}
                onChangeText={text => setCode(text.replace(/\s/g, '').toUpperCase())}
                autoCapitalize="characters"
                maxLength={6}
                textAlign="center"
            />

            {error && <Text style={styles.errorText}>{error}</Text>}
            
            <TouchableOpacity style={styles.button} onPress={() => handleCodeSubmit()} disabled={isLoading}>
                <Text style={styles.buttonText}>{isLoading ? 'Checking...' : 'Join Family'}</Text>
            </TouchableOpacity>

            {Platform.OS === 'web' && (
                <View style={styles.qrContainer}>
                    <Text style={styles.orText}>OR</Text>
                    <div id="qr-reader" style={{ width: '100%' }}></div>
                </View>
            )}

            {Platform.OS !== 'web' && (
                <>
                  <Text style={styles.orText}>OR</Text>
                  <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('QRScanner')} disabled={isLoading}>
                    <Text style={styles.buttonText}>Scan QR Instead</Text>
                  </TouchableOpacity>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: colors.background,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
        color: colors.text,
    },
    subtitle: {
        fontSize: 16,
        color: colors.textSecondary,
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 20,
    },
    input: {
        width: '80%',
        backgroundColor: colors.white,
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderRadius: 15,
        fontSize: 24,
        fontWeight: 'bold',
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 20,
        letterSpacing: 8,
    },
    button: {
        backgroundColor: colors.primary,
        paddingVertical: 15,
        borderRadius: 15,
        alignItems: 'center',
        width: '80%',
    },
    buttonText: {
        color: colors.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
    qrContainer: {
        width: '80%',
        marginTop: 20,
        alignItems: 'center',
    },
    orText: {
        fontSize: 16,
        color: colors.textSecondary,
        marginBottom: 10,
        fontWeight: 'bold',
    },
    errorText: {
        color: colors.error,
        textAlign: 'center',
        marginBottom: 20,
        width: '80%',
    }
}); 