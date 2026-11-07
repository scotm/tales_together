import { api } from "@convex/_generated/api";
import {
  BACKPACK_SIZE,
  type CatalogOption,
  CONVEYOR_ITEMS,
  HERO_ARCHETYPES,
  HERO_OUTFITS,
  QUIRK_STICKERS,
  WORLD_PROBLEMS,
  WORLD_SETTINGS,
} from "@convex/catalog";
import {
  useConvex,
  useConvexConnectionState,
  useMutation,
  useQuery,
} from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useReconnectBackend } from "@/lib/BackendProvider";
import { useDiagnostics } from "@/lib/diagnostics/DiagnosticsProvider";
import { useQueryDiagnostics } from "@/lib/diagnostics/query";

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)] as T;
}

function Choice({
  option,
  selected,
  onPress,
}: {
  option: CatalogOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {option.label}
      </Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const stories = useQuery(api.stories.listRecent);
  const createStory = useMutation(api.stories.create);
  const client = useConvex();
  const connection = useConvexConnectionState();
  const reconnect = useReconnectBackend();
  const diagnostics = useDiagnostics();
  useQueryDiagnostics(
    "stories.listRecent",
    stories,
    connection.isWebSocketConnected,
  );
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const waiting = stories === undefined || !connection.isWebSocketConnected;
  useEffect(() => {
    setLoadTimedOut(false);
    if (!waiting) return;
    const timer = setTimeout(() => {
      setLoadTimedOut(true);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [waiting]);

  const [setting, setSetting] = useState<CatalogOption>(WORLD_SETTINGS[0]);
  const [problem, setProblem] = useState<CatalogOption>(WORLD_PROBLEMS[0]);
  const [lockedSetting, setLockedSetting] = useState(false);
  const [lockedProblem, setLockedProblem] = useState(false);

  const [heroName, setHeroName] = useState("Barnaby");
  const [archetype, setArchetype] = useState<CatalogOption>(HERO_ARCHETYPES[0]);
  const [outfit, setOutfit] = useState<CatalogOption>(HERO_OUTFITS[0]);
  const [quirk, setQuirk] = useState<CatalogOption>(QUIRK_STICKERS[0]);

  const [packed, setPacked] = useState<string[]>([
    "item_whisk",
    "item_jam",
    "item_kazoo",
  ]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function spin() {
    if (!lockedSetting) setSetting(pick(WORLD_SETTINGS));
    if (!lockedProblem) setProblem(pick(WORLD_PROBLEMS));
  }

  function toggleItem(id: string) {
    setPacked((current) =>
      current.includes(id)
        ? current.filter((itemId) => itemId !== id)
        : current.length < BACKPACK_SIZE
          ? [...current, id]
          : current,
    );
  }

  async function startStory() {
    if (!connection.isWebSocketConnected) {
      setError("Connect to the story server before starting a story.");
      return;
    }
    if (packed.length !== BACKPACK_SIZE) {
      setError(`Pack exactly ${BACKPACK_SIZE} things first.`);
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const storyId = await diagnostics.track("stories.create", () =>
        createStory({
          title: `${heroName} and the ${problem.label.replace(/!$/, "")}`,
          setting: setting.promptFragment,
          centralProblem: problem.promptFragment,
          protagonistName: heroName,
          protagonistQuirk: quirk.promptFragment,
          visualDescription: `${archetype.promptFragment} ${outfit.promptFragment}`,
          backpackItems: packed.map((id) => ({
            id,
            name: CONVEYOR_ITEMS.find((item) => item.id === id)?.label ?? id,
          })),
        }),
      );
      router.push({ pathname: "/story/[storyId]", params: { storyId } });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start a story",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tales Together</Text>
        <Text style={styles.subtitle}>
          Build a world, pick a hero, pack three things.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/diagnostics")}
          style={styles.help}
        >
          <Text style={styles.helpLabel}>Help &amp; diagnostics</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Where are we?</Text>
          {WORLD_SETTINGS.map((option) => (
            <Choice
              key={option.id}
              option={option}
              selected={option.id === setting.id}
              onPress={() => setSetting(option)}
            />
          ))}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: lockedSetting }}
            onPress={() => setLockedSetting((value) => !value)}
            style={styles.lock}
          >
            <Text style={styles.lockLabel}>
              {lockedSetting ? "🔒 Keep this place" : "🔓 Can change"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What went wrong?</Text>
          {WORLD_PROBLEMS.map((option) => (
            <Choice
              key={option.id}
              option={option}
              selected={option.id === problem.id}
              onPress={() => setProblem(option)}
            />
          ))}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: lockedProblem }}
            onPress={() => setLockedProblem((value) => !value)}
            style={styles.lock}
          >
            <Text style={styles.lockLabel}>
              {lockedProblem ? "🔒 Keep this trouble" : "🔓 Can change"}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={spin}
            style={styles.spin}
          >
            <Text style={styles.spinLabel}>🎲 Spin the story</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who is the hero?</Text>
          <TextInput
            value={heroName}
            onChangeText={setHeroName}
            placeholder="Hero name"
            autoCapitalize="words"
            style={styles.input}
          />
          <View style={styles.row}>
            {HERO_ARCHETYPES.map((option) => (
              <Choice
                key={option.id}
                option={option}
                selected={option.id === archetype.id}
                onPress={() => setArchetype(option)}
              />
            ))}
          </View>
          <View style={styles.row}>
            {HERO_OUTFITS.map((option) => (
              <Choice
                key={option.id}
                option={option}
                selected={option.id === outfit.id}
                onPress={() => setOutfit(option)}
              />
            ))}
          </View>
          <View style={styles.row}>
            {QUIRK_STICKERS.map((option) => (
              <Choice
                key={option.id}
                option={option}
                selected={option.id === quirk.id}
                onPress={() => setQuirk(option)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Pack {BACKPACK_SIZE} things ({packed.length}/{BACKPACK_SIZE})
          </Text>
          <View style={styles.row}>
            {CONVEYOR_ITEMS.map((option) => (
              <Choice
                key={option.id}
                option={option}
                selected={packed.includes(option.id)}
                onPress={() => toggleItem(option.id)}
              />
            ))}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={startStory}
          disabled={creating || !connection.isWebSocketConnected}
          style={({ pressed }) => [
            styles.button,
            !connection.isWebSocketConnected && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonLabel}>
            {creating ? "Starting..." : "Start the story"}
          </Text>
        </Pressable>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent stories</Text>
          {waiting && !loadTimedOut ? (
            <View>
              <ActivityIndicator accessibilityLabel="Loading recent stories" />
              <Text style={styles.muted}>Connecting to your stories…</Text>
            </View>
          ) : null}
          {loadTimedOut && waiting ? (
            <View style={styles.card} accessibilityRole="alert">
              <Text style={styles.error}>
                {connection.isWebSocketConnected
                  ? "The story server is taking too long to respond."
                  : "Cannot connect to the story server. Check your connection and keep the server running."}
              </Text>
              <Text selectable style={styles.muted}>
                Server: {client.url}
              </Text>
              <Text style={styles.muted}>We’ll reconnect automatically.</Text>
              {connection.inflightMutations || connection.inflightActions ? (
                <Text style={styles.muted}>
                  Waiting for your pending request. Keep this page open.
                </Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={reconnect}
                  style={styles.spin}
                >
                  <Text style={styles.spinLabel}>Try connecting again</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/diagnostics")}
                style={styles.spin}
              >
                <Text style={styles.spinLabel}>Help &amp; diagnostics</Text>
              </Pressable>
            </View>
          ) : null}
          {stories?.length === 0 ? (
            <Text style={styles.muted}>
              No stories yet. Make the first one.
            </Text>
          ) : null}
          {stories?.map((story) => (
            <Pressable
              key={story._id}
              accessibilityRole="link"
              onPress={() =>
                router.push({
                  pathname: "/story/[storyId]",
                  params: { storyId: story._id },
                })
              }
              style={styles.card}
            >
              <Text style={styles.cardTitle}>{story.title}</Text>
              <Text style={styles.muted}>
                {story.totalChapters} chapters · {story.readingLevel}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FDF6E3" },
  content: {
    padding: 24,
    gap: 16,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 36, fontWeight: "800", color: "#1F1A17" },
  subtitle: { fontSize: 16, lineHeight: 24, color: "#57534E" },
  help: { alignSelf: "flex-start", paddingVertical: 4 },
  helpLabel: { fontSize: 15, color: "#92400E" },
  section: { marginTop: 16, gap: 8 },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: "#1F1A17" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 2,
    borderColor: "#E7E5E4",
    borderBottomWidth: 4,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: { borderColor: "#D97706", backgroundColor: "#FEF3C7" },
  chipLabel: { fontSize: 14, color: "#44403C" },
  chipLabelSelected: { fontWeight: "700", color: "#92400E" },
  lock: { alignSelf: "flex-start", paddingVertical: 4 },
  lockLabel: { fontSize: 14, color: "#78716C" },
  spin: {
    alignSelf: "flex-start",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FDE68A",
    borderWidth: 2,
    borderColor: "#D97706",
    borderBottomWidth: 4,
  },
  spinLabel: { fontSize: 15, fontWeight: "600", color: "#92400E" },
  input: {
    borderWidth: 2,
    borderColor: "#E7E5E4",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  button: {
    backgroundColor: "#F59E0B",
    borderBottomWidth: 6,
    borderBottomColor: "#B45309",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  buttonPressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 18, fontWeight: "700", color: "#1F1A17" },
  error: { color: "#B91C1C" },
  muted: { color: "#78716C" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E7E5E4",
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: "#1F1A17" },
});
