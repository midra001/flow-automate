import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import AuthScreen from './src/screens/AuthScreen';
import LandingScreen from './src/screens/LandingScreen';
import HomeScreen from './src/screens/HomeScreen';
import EditorScreen from './src/screens/EditorScreen';
import NodeConfigScreen from './src/screens/NodeConfigScreen';
import ExecutionScreen from './src/screens/ExecutionScreen';
import HistoryScreen from './src/screens/HistoryScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Landing"
        screenOptions={{
          headerStyle: { backgroundColor: '#1E293B' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Landing" 
          component={LandingScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Auth" 
          component={AuthScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'FlowAutomate' }} 
        />
        <Stack.Screen 
          name="Editor" 
          component={EditorScreen} 
          options={{ title: 'Workflow Editor' }} 
        />
        <Stack.Screen 
          name="NodeConfig" 
          component={NodeConfigScreen} 
          options={{ title: 'Configure Node' }} 
        />
        <Stack.Screen 
          name="Execution" 
          component={ExecutionScreen} 
          options={{ title: 'Execution Live' }} 
        />
        <Stack.Screen 
          name="History" 
          component={HistoryScreen} 
          options={{ title: 'Execution Logs' }} 
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}