/**
 * Templates Expo / React Native injectés par Elena via le tool `scaffold_mobile_app`.
 * Reste 100 % statique : pas de runtime, juste des fichiers prêts à exporter (ZIP / GitHub).
 *
 * Stack : Expo SDK 51 · React Native 0.74 · React Navigation v6 (native-stack + bottom-tabs)
 *         · TypeScript · NativeWind (tailwind RN) · safe-area-context.
 */

export type MobileTheme = "dark" | "light";

export type MobileScaffoldOptions = {
  appName: string;
  slug?: string;
  theme?: MobileTheme;
  primaryColor?: string;          // hex, default #3B82F6
  tabs?: string[];                // ex: ["Home","Explore","Profile"]
};

export type MobileFile = { path: string; content: string };

const tpl = (s: string) => s.replace(/^\n/, "");

// ─────────────────────────────────────────────
// Fichiers racine (config Expo / TS / Tailwind)
// ─────────────────────────────────────────────
function rootFiles(opts: Required<MobileScaffoldOptions>): MobileFile[] {
  const { appName, slug, theme, primaryColor } = opts;
  return [
    {
      path: "package.json",
      content: tpl(`
{
  "name": "${slug}",
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~51.0.0",
    "expo-status-bar": "~1.12.1",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-screens": "3.31.1",
    "@react-navigation/native": "^6.1.18",
    "@react-navigation/native-stack": "^6.10.1",
    "@react-navigation/bottom-tabs": "^6.6.1",
    "@expo/vector-icons": "^14.0.2",
    "nativewind": "^2.0.11"
  },
  "devDependencies": {
    "@babel/core": "^7.24.0",
    "@types/react": "~18.2.79",
    "tailwindcss": "3.3.2",
    "typescript": "~5.3.3"
  },
  "private": true
}
`),
    },
    {
      path: "app.json",
      content: tpl(`
{
  "expo": {
    "name": "${appName}",
    "slug": "${slug}",
    "scheme": "${slug}",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "${theme === "dark" ? "dark" : "light"}",
    "newArchEnabled": true,
    "ios": { "supportsTablet": true, "bundleIdentifier": "com.nexyra.${slug.replace(/[^a-z0-9]/gi, "")}" },
    "android": { "package": "com.nexyra.${slug.replace(/[^a-z0-9]/gi, "")}" },
    "plugins": ["expo-router"]
  }
}
`),
    },
    {
      path: "babel.config.js",
      content: tpl(`
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["nativewind/babel"],
  };
};
`),
    },
    {
      path: "tailwind.config.js",
      content: tpl(`
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "${primaryColor}",
        bg: "${theme === "dark" ? "#0A0A0F" : "#FFFFFF"}",
        surface: "${theme === "dark" ? "#14141C" : "#F4F4F7"}",
        ink: "${theme === "dark" ? "#F8FAFC" : "#0F172A"}",
        muted: "${theme === "dark" ? "#94A3B8" : "#64748B"}",
      },
    },
  },
  plugins: [],
};
`),
    },
    {
      path: "tsconfig.json",
      content: tpl(`
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
`),
    },
    {
      path: "README.md",
      content: tpl(`
# ${appName}

App mobile générée par Elena (Nexyra).

## Démarrer

\`\`\`bash
bun install   # ou npm i / pnpm i
bun run start # puis scanner le QR code avec Expo Go
\`\`\`

## Structure
- \`App.tsx\` — point d'entrée, navigation + thème.
- \`src/screens\` — un fichier par écran.
- \`src/components\` — composants réutilisables (Card, Button…).
- \`tailwind.config.js\` — palette synchronisée avec le thème Nexyra.
`),
    },
  ];
}

// ─────────────────────────────────────────────
// App.tsx (navigation racine)
// ─────────────────────────────────────────────
function appEntry(opts: Required<MobileScaffoldOptions>): MobileFile {
  const { tabs, theme, primaryColor } = opts;
  const tabImports = tabs.map((t) => `import ${t}Screen from "@/screens/${t}";`).join("\n");
  const tabRoutes = tabs
    .map(
      (t) => `      <Tab.Screen
        name="${t}"
        component={${t}Screen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="${iconFor(t)}" color={color} size={size} />
          ),
        }}
      />`,
    )
    .join("\n");
  const isDark = theme === "dark";
  return {
    path: "App.tsx",
    content: tpl(`
import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

${tabImports}

const Tab = createBottomTabNavigator();

const theme = {
  ...(${isDark} ? DarkTheme : DefaultTheme),
  colors: {
    ...(${isDark} ? DarkTheme.colors : DefaultTheme.colors),
    primary: "${primaryColor}",
    background: "${isDark ? "#0A0A0F" : "#FFFFFF"}",
    card: "${isDark ? "#14141C" : "#FFFFFF"}",
    text: "${isDark ? "#F8FAFC" : "#0F172A"}",
    border: "${isDark ? "#1F1F2A" : "#E5E7EB"}",
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: { borderTopWidth: 0, elevation: 0, backgroundColor: theme.colors.card },
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: "${isDark ? "#64748B" : "#94A3B8"}",
          }}
        >
${tabRoutes}
        </Tab.Navigator>
      </NavigationContainer>
      <StatusBar style="${isDark ? "light" : "dark"}" />
    </SafeAreaProvider>
  );
}
`),
  };
}

function iconFor(tab: string): string {
  const t = tab.toLowerCase();
  if (t.includes("home") || t.includes("accueil")) return "home";
  if (t.includes("profile") || t.includes("profil") || t.includes("compte")) return "person-circle";
  if (t.includes("explore") || t.includes("search") || t.includes("recherche")) return "search";
  if (t.includes("settings") || t.includes("réglage") || t.includes("reglage")) return "settings";
  if (t.includes("cart") || t.includes("panier")) return "cart";
  if (t.includes("chat") || t.includes("message")) return "chatbubble-ellipses";
  if (t.includes("notif")) return "notifications";
  if (t.includes("library") || t.includes("biblio") || t.includes("favoris")) return "bookmark";
  return "apps";
}

// ─────────────────────────────────────────────
// Composants réutilisables
// ─────────────────────────────────────────────
function sharedComponents(): MobileFile[] {
  return [
    {
      path: "src/components/Screen.tsx",
      content: tpl(`
import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = { children: React.ReactNode; scroll?: boolean };

export default function Screen({ children, scroll = true }: Props) {
  const insets = useSafeAreaInsets();
  const Wrapper = scroll ? ScrollView : View;
  return (
    <Wrapper
      style={[styles.root]}
      contentContainerStyle={scroll ? { paddingTop: insets.top + 16, paddingBottom: 32, paddingHorizontal: 20 } : undefined}
    >
      {!scroll && <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, flex: 1 }}>{children}</View>}
      {scroll && children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
`),
    },
    {
      path: "src/components/Card.tsx",
      content: tpl(`
import React from "react";
import { View, Text, StyleSheet, ViewProps } from "react-native";
import { useTheme } from "@react-navigation/native";

type Props = ViewProps & { title?: string; subtitle?: string };

export default function Card({ title, subtitle, children, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View
      {...rest}
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        style,
      ]}
    >
      {title ? <Text style={[styles.title, { color: colors.text }]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, { color: colors.text, opacity: 0.6 }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  title: { fontSize: 16, fontWeight: "600", marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 8 },
});
`),
    },
    {
      path: "src/components/PrimaryButton.tsx",
      content: tpl(`
import React from "react";
import { Pressable, Text, StyleSheet, PressableProps } from "react-native";
import { useTheme } from "@react-navigation/native";

type Props = PressableProps & { label: string };

export default function PrimaryButton({ label, style, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 14, borderRadius: 14, alignItems: "center", marginTop: 8 },
  label: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
`),
    },
  ];
}

// ─────────────────────────────────────────────
// Templates d'écrans (1 par tab)
// ─────────────────────────────────────────────
export function buildScreen(name: string): MobileFile {
  const t = name.toLowerCase();
  if (t.includes("profile") || t.includes("profil") || t.includes("compte")) {
    return {
      path: `src/screens/${name}.tsx`,
      content: tpl(`
import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import Screen from "@/components/Screen";
import Card from "@/components/Card";
import PrimaryButton from "@/components/PrimaryButton";

export default function ${name}Screen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Image source={{ uri: "https://i.pravatar.cc/200?img=12" }} style={styles.avatar} />
        <Text style={styles.name}>Alex Dupont</Text>
        <Text style={styles.email}>alex@nexyra.app</Text>
      </View>
      <Card title="Compte" subtitle="Préférences & sécurité" />
      <Card title="Notifications" subtitle="Push, email, in-app" />
      <Card title="Apparence" subtitle="Thème · Langue · Accessibilité" />
      <PrimaryButton label="Se déconnecter" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 96, height: 96, borderRadius: 48, marginBottom: 12 },
  name: { fontSize: 20, fontWeight: "700" },
  email: { opacity: 0.6, marginTop: 2 },
});
`),
    };
  }
  if (t.includes("explore") || t.includes("search") || t.includes("recherche")) {
    return {
      path: `src/screens/${name}.tsx`,
      content: tpl(`
import React from "react";
import { Text, TextInput, StyleSheet, FlatList, View } from "react-native";
import Screen from "@/components/Screen";
import Card from "@/components/Card";
import { useTheme } from "@react-navigation/native";

const ITEMS = Array.from({ length: 8 }).map((_, i) => ({
  id: String(i + 1),
  title: \`Découverte \${i + 1}\`,
  subtitle: "Suggéré pour toi",
}));

export default function ${name}Screen() {
  const { colors } = useTheme();
  return (
    <Screen scroll={false}>
      <Text style={[styles.title, { color: colors.text }]}>Explorer</Text>
      <TextInput
        placeholder="Rechercher…"
        placeholderTextColor={colors.text + "80"}
        style={[styles.input, { borderColor: colors.border, color: colors.text }]}
      />
      <FlatList
        data={ITEMS}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => <Card title={item.title} subtitle={item.subtitle} />}
        contentContainerStyle={{ paddingVertical: 16 }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "800", marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
`),
    };
  }
  // default = Home / generic
  return {
    path: `src/screens/${name}.tsx`,
    content: tpl(`
import React from "react";
import { Text, StyleSheet, View } from "react-native";
import Screen from "@/components/Screen";
import Card from "@/components/Card";
import PrimaryButton from "@/components/PrimaryButton";
import { useTheme } from "@react-navigation/native";

export default function ${name}Screen() {
  const { colors } = useTheme();
  return (
    <Screen>
      <Text style={[styles.hello, { color: colors.text }]}>Bonjour 👋</Text>
      <Text style={[styles.lead, { color: colors.text, opacity: 0.65 }]}>
        Bienvenue sur ton app. Voici ce qui se passe aujourd'hui.
      </Text>

      <View style={styles.row}>
        <Card style={{ flex: 1, marginRight: 6 }} title="12" subtitle="Nouveautés" />
        <Card style={{ flex: 1, marginLeft: 6 }} title="3" subtitle="À faire" />
      </View>

      <Card title="Activité récente" subtitle="Cette semaine">
        <Text style={{ color: colors.text, opacity: 0.7, marginTop: 4 }}>
          Aucune activité pour le moment — commence par créer ton premier élément.
        </Text>
      </Card>

      <PrimaryButton label="Commencer" onPress={() => {}} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { fontSize: 28, fontWeight: "800" },
  lead: { fontSize: 15, marginTop: 6, marginBottom: 20 },
  row: { flexDirection: "row", marginBottom: 4 },
});
`),
  };
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────
export function buildMobileScaffold(input: MobileScaffoldOptions): MobileFile[] {
  const opts: Required<MobileScaffoldOptions> = {
    appName: input.appName,
    slug: (input.slug ?? input.appName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app",
    theme: input.theme ?? "dark",
    primaryColor: input.primaryColor ?? "#3B82F6",
    tabs: input.tabs && input.tabs.length > 0 ? input.tabs : ["Home", "Explore", "Profile"],
  };
  return [
    ...rootFiles(opts),
    appEntry(opts),
    ...sharedComponents(),
    ...opts.tabs.map((t) => buildScreen(t)),
  ];
}
