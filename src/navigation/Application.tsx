import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Paths } from '@/navigation/paths';
import type { RootStackParamList } from '@/navigation/types';
import { useTheme } from '@/theme';

import {
    Categories,
    CategoryPicker,
    Exam,
    Example,
    Home,
    Mistakes,
    Quiz,
    Startup,
    Statistics,
} from '@/screens';

const Stack = createStackNavigator<RootStackParamList>();

function ApplicationNavigator() {
  const { navigationTheme, variant } = useTheme();

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator key={variant} screenOptions={{ headerShown: false }}>
          <Stack.Screen component={Startup} name={Paths.Startup} />
          <Stack.Screen component={Home} name={Paths.Home} />
          <Stack.Screen component={CategoryPicker} name={Paths.CategoryPicker} />
          <Stack.Screen component={Categories} name={Paths.Categories} />
          <Stack.Screen component={Quiz} name={Paths.Quiz} />
          <Stack.Screen component={Exam} name={Paths.Exam} />
          <Stack.Screen component={Mistakes} name={Paths.Mistakes} />
          <Stack.Screen component={Statistics} name={Paths.Statistics} />
          <Stack.Screen component={Example} name={Paths.Example} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default ApplicationNavigator;
