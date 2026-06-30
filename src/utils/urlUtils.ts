import { Linking } from 'react-native';

export const openWebsiteUrl = (url: string | null | undefined) => {
  if (!url) {
    return;
  }
  let fullUrl = url.trim();
  if (!/^(f|ht)tps?:\/\//i.test(fullUrl)) {
    fullUrl = `https://` + fullUrl;
  }
  Linking.openURL(fullUrl).catch(err => console.error("Couldn't load page", err));
}; 