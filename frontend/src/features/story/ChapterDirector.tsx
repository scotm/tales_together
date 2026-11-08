import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  colors,
  layout,
  radii,
  spacing,
  type,
} from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { writingPhrases } from "@/lib/loadingPhrases";
import { recapSentence } from "@/lib/recap";
import { workshopAssets } from "@/lib/workshopAssets";
import { storyStyles } from "./storyStyles";
import type { StoryWorkshop } from "./useStoryWorkshop";
import { Working } from "./Working";

const beatArt = {
  BOLD_ACTION: "beat_bold",
  CLEVER_TRICK: "beat_clever",
  SILLY_TWIST: "beat_silly",
  KID_WILDCARD: "beat_neutral",
};
const beatTint = {
  BOLD_ACTION: colors.apricot,
  CLEVER_TRICK: colors.mint,
  SILLY_TWIST: colors.lavender,
  KID_WILDCARD: colors.gold,
};
const itemStatus = {
  IN_BACKPACK: "In the bag",
  RESERVED_THIS_CHAPTER: "Saved for this chapter",
  USED: "Used",
};
export function ChapterDirector({ workshop }: { workshop: StoryWorkshop }) {
  const {
    story,
    chapter,
    viewingActive,
    isWriting,
    selecting,
    pitching,
    pick,
    deal,
    write,
  } = workshop;
  const { width } = useWindowDimensions();
  if (!story || !chapter || !viewingActive) return null;
  const hero =
    story.characters?.find((row) => row.role === "PROTAGONIST")?.name ??
    "your hero";
  const disabled =
    isWriting ||
    selecting ||
    pitching ||
    !workshop.connection.isWebSocketConnected;
  const wide = width >= layout.splitMinWidth;
  const bag = story.story.items.map((item) => item.name);
  const moved = story.story.items.some((item) => item.status !== "IN_BACKPACK");
  return (
    <View style={storyStyles.section}>
      {chapter.recapOneLiner ? (
        <View style={[styles.recap, wide && styles.recapWide]}>
          <Text style={styles.recapLabel}>Last time</Text>
          <Text style={[storyStyles.body, styles.recapText]}>
            {recapSentence(chapter.recapOneLiner)}
          </Text>
        </View>
      ) : null}
      <Text style={styles.eyebrow}>
        Chapter {chapter.index} of {story.story.totalChapters} · Your director’s
        chair
      </Text>
      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          { fontSize: wide ? 56 : 32, lineHeight: wide ? 64 : 40 },
        ]}
      >
        What should {hero} do next?
      </Text>
      {chapter.beatCards.length === 0 ? (
        <View style={storyStyles.panel}>
          <Text style={storyStyles.body}>
            Let’s find three ways this chapter could begin.
          </Text>
          <WorkshopButton
            label="Deal 3 cards"
            busy={pitching}
            busyLabel="Dealing…"
            disabled={disabled}
            onPress={deal}
          />
        </View>
      ) : (
        <>
          <Text style={styles.lede}>
            Choose an idea, then write the chapter when you’re ready.
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Chapter ideas"
            style={[styles.cards, wide && styles.cardsWide]}
          >
            {chapter.beatCards.map((card) => {
              const selected = chapter.chosenBeat?.cardId === card.cardId;
              const item = story.story.items.find(
                (row) => row.id === card.suggestedItemId,
              );
              return (
                <Pressable
                  key={card.cardId}
                  accessibilityRole="radio"
                  accessibilityLabel={`${card.title}. ${card.kidFriendlyPitch}`}
                  accessibilityState={{
                    checked: selected,
                    disabled: disabled || chapter.status !== "DIRECTING",
                  }}
                  disabled={disabled}
                  onPress={() => {
                    void pick(card.cardId);
                  }}
                  style={[styles.card, selected && styles.chosen]}
                >
                  <View
                    style={[
                      styles.artWell,
                      { backgroundColor: beatTint[card.style] ?? colors.mint },
                    ]}
                  >
                    <Image
                      accessible={false}
                      source={
                        workshopAssets[beatArt[card.style] ?? "beat_neutral"]
                      }
                      style={styles.art}
                      resizeMode="contain"
                    />
                  </View>
                  {selected ? (
                    <View style={styles.choiceBadge}>
                      <Text style={styles.choiceBadgeLabel}>YOUR CHOICE ✓</Text>
                    </View>
                  ) : null}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardLabel}>
                      {card.style === "BOLD_ACTION"
                        ? "The bold move"
                        : card.style === "CLEVER_TRICK"
                          ? "The clever plan"
                          : card.style === "SILLY_TWIST"
                            ? "The silly twist"
                            : "A wild card"}
                    </Text>
                    <Text style={styles.cardTitle}>
                      {card.iconEmoji} {card.title}
                    </Text>
                    <Text style={storyStyles.body}>
                      {card.kidFriendlyPitch}
                    </Text>
                    {item ? (
                      <Text style={styles.badge}>
                        🎒 {item.name} · {itemStatus[item.status]}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.footer, wide && styles.footerWide]}>
            <View style={styles.bagPill}>
              <Text style={styles.bagLabel}>
                {bag.length
                  ? `In your bag: ${bag.join(" · ")}`
                  : "Your bag is empty"}
              </Text>
            </View>
            <WorkshopButton
              label={
                chapter.writingError ||
                (chapter.status === "WRITING" && !chapter.writingRunId)
                  ? "Try chapter again"
                  : "Write this chapter"
              }
              busy={isWriting}
              busyLabel="Writing…"
              disabled={disabled || !chapter.chosenBeat}
              style={wide ? styles.writeButton : undefined}
              onPress={write}
            />
          </View>
          <Text style={styles.caption}>
            {selecting
              ? "Keeping your choice…"
              : chapter.chosenBeat
                ? `Your choice: ${chapter.chosenBeat.title}`
                : "Pick one idea to keep going."}
          </Text>
          {moved ? (
            <Text style={storyStyles.muted}>
              {story.story.items
                .map((item) => `${item.name} · ${itemStatus[item.status]}`)
                .join("   ")}
            </Text>
          ) : null}
        </>
      )}
      {isWriting ? <Working phrases={writingPhrases} /> : null}
      {isWriting && chapter.writingRetry ? (
        <Text accessibilityLiveRegion="polite" style={storyStyles.muted}>
          The storyteller is taking a moment. Trying again (
          {chapter.writingRetry.attempt}/{chapter.writingRetry.maxAttempts})…
        </Text>
      ) : null}
      {chapter.writingError && !isWriting ? (
        <Text accessibilityRole="alert" style={storyStyles.error}>
          {chapter.writingError}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  eyebrow: { ...type.eyebrow, color: colors.mutedInk, marginTop: spacing.sm },
  title: { ...type.chapter, color: colors.ink },
  lede: { ...type.intro, color: colors.mutedInk, marginBottom: spacing.sm },
  recap: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  recapWide: { flexDirection: "row", alignItems: "center", gap: spacing.xxl },
  recapLabel: { ...type.eyebrow, color: colors.ink, minWidth: 96 },
  recapText: { flex: 1 },
  cards: { gap: spacing.xl },
  cardsWide: { flexDirection: "row", alignItems: "stretch" },
  card: {
    flex: 1,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  chosen: { borderColor: colors.ink },
  artWell: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    margin: 6,
    borderRadius: radii.card - 6,
    overflow: "hidden",
  },
  art: { width: "100%", height: 140 },
  choiceBadge: {
    position: "absolute",
    top: spacing.lg,
    right: spacing.lg,
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
  },
  choiceBadgeLabel: { ...type.label, fontSize: 12, color: colors.surface },
  cardBody: { gap: spacing.sm, padding: spacing.xl },
  cardLabel: { ...type.eyebrow, color: colors.mutedInk },
  cardTitle: { ...type.cardTitle, color: colors.ink },
  badge: { ...type.small, color: colors.violet },
  footer: { gap: spacing.md },
  footerWide: { flexDirection: "row", alignItems: "stretch" },
  bagPill: {
    flex: 1,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    borderRadius: radii.control + 4,
    backgroundColor: colors.surface,
  },
  bagLabel: { ...type.label, color: colors.ink, textAlign: "center" },
  writeButton: { flexBasis: 454, flexGrow: 0 },
  caption: {
    ...type.small,
    color: colors.mutedInk,
    textAlign: "center",
  },
});
