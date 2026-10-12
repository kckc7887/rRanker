const { AndroidConfig, withAndroidManifest, withGradleProperties } = require('expo/config-plugins');

module.exports = function withArcadeMap(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE',
    'android.permission.ACCESS_WIFI_STATE',
  ]);
  config = withGradleProperties(config, config => {
    const properties = config.modResults.filter(entry => entry.type !== 'property' || entry.key !== 'android.enableJetifier');
    config.modResults = [...properties, { type: 'property', key: 'android.enableJetifier', value: 'true' }];
    return config;
  });
  return withAndroidManifest(config, config => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const metadata = (application['meta-data'] ?? []).filter(entry => entry.$['android:name'] !== 'com.amap.api.v2.apikey');
    const key = process.env.AMAP_ANDROID_KEY?.trim();
    if (key) metadata.push({ $: { 'android:name': 'com.amap.api.v2.apikey', 'android:value': key } });
    application['meta-data'] = metadata;
    application.service = (application.service ?? []).filter(entry => entry.$['android:name'] !== 'com.amap.api.location.APSService');
    return config;
  });
};
