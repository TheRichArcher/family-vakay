import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  style?: any;
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', style }) => {
  const height = size === 'lg' ? 120 : size === 'sm' ? 50 : 80;
  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('../../assets/family-vakay-logo.png')}
        style={{ height, width: '80%' }}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BrandLogo;


