import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#246BFD', headerStyle: { backgroundColor: '#F7F8FA' }, headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: '总览', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="b50" options={{ title: 'B50', tabBarIcon: ({ color, size }) => <Ionicons name="trophy-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="records" options={{ title: '成绩', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="search" options={{ title: '查歌', tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
