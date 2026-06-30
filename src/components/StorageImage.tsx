import React, { useState, useEffect } from 'react';
import { Image, View, ActivityIndicator, StyleSheet } from 'react-native';
import type { ImageProps } from 'react-native';
import { storageService } from '../services/storageService';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';

interface StorageImageProps {
  path: string | null | undefined;
  style: any;
  resizeMode?: ImageProps['resizeMode'];
}

export function StorageImage({ path, style, resizeMode }: StorageImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (path) {
      setIsLoading(true);
      setError(false);
      storageService.getDownloadUrlForPath(path)
        .then(downloadUrl => {
          if (isMounted) {
            setUrl(downloadUrl);
            if (!downloadUrl) setError(true);
          }
        })
        .catch(() => {
          if (isMounted) setError(true);
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });
    } else {
        setIsLoading(false);
    }
    return () => { isMounted = false; };
  }, [path]);

  if (isLoading) {
    return (
      <View style={[style, styles.center]}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (error || !url) {
    return (
        <View style={[style, styles.center]}>
            <Ionicons name="alert-circle-outline" size={24} color={colors.muted} />
        </View>
    );
  }

  return <Image source={{ uri: url }} style={style} resizeMode={resizeMode || 'cover'} />;
}

const styles = StyleSheet.create({
    center: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#eef2f6',
    }
}) 