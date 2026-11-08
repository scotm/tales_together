import { Component, type ReactNode } from "react";
import { Text } from "react-native";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import {
  HeaderButton,
  WorkshopShell,
} from "@/components/workshop/WorkshopShell";
import { ConnectionNotice } from "./ConnectionNotice";
import type { RecentStories } from "./useRecentStories";

/** A query failure must leave both the saved draft and existing books reachable. */
export class CatalogBoundary extends Component<
  {
    children: ReactNode;
    recent: RecentStories;
    onRecent(): void;
    onRetry(): void;
    onFailure(): void;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    if (!this.state.failed) return this.props.children;
    const { recent, onRecent, onRetry } = this.props;
    const pending =
      recent.connection.inflightActions || recent.connection.inflightMutations;
    return (
      <WorkshopShell
        headerActions={
          <HeaderButton label="Recent stories" onPress={onRecent} />
        }
      >
        <ConnectionNotice recent={recent} />
        <Text accessibilityRole="alert">
          The idea shelves could not load. Your choices are kept. Try again in a
          moment.
        </Text>
        <WorkshopButton
          label="Retry loading choices"
          disabled={Boolean(pending)}
          onPress={onRetry}
        />
      </WorkshopShell>
    );
  }
}
