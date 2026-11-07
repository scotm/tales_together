import { Component, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { classifyError } from "../../../shared/diagnostics/contract";
import type { DiagnosticsApi } from "./DiagnosticsProvider";

interface Props {
  diagnostics: DiagnosticsApi;
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/** The root boundary records the failure before showing a safe fallback. */
export class DiagnosticsErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const classified = classifyError(error);
    this.props.diagnostics.record("operation.failed", {
      level: "error",
      status: "failed",
      stage: "error_boundary",
      errorCode: classified.code,
      message: classified.safeMessage,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.screen}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The story is saved. Close and open the app, then try again.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FDF6E3",
    padding: 24,
    gap: 12,
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "800", color: "#1F1A17" },
  body: { fontSize: 16, lineHeight: 24, color: "#57534E" },
});
