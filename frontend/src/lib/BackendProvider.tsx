import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { createContext, type ReactNode, useContext, useState } from "react";
import { publishableKey } from "./clerk";
import { convex, createConvexClient } from "./convex";
import { useDiagnostics } from "./diagnostics/DiagnosticsProvider";

const RecoveryContext = createContext<() => void>(() => {});

export function BackendProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState(convex);
  const diagnostics = useDiagnostics();

  function reconnect() {
    const state = client.connectionState();
    // Closing a client discards queued writes. Let those finish/reconnect first.
    if (state.inflightMutations || state.inflightActions) {
      diagnostics.record("connection.reconnect_blocked", {
        level: "warn",
        status: "skipped",
        stage: "reconnect",
        message: "Pending writes must finish before reconnecting.",
      });
      return;
    }
    diagnostics.record("connection.reconnect_requested", {
      status: "started",
      stage: "reconnect",
    });
    void client.close();
    setClient(createConvexClient());
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <RecoveryContext.Provider value={reconnect}>
        <ConvexProviderWithClerk client={client} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
      </RecoveryContext.Provider>
    </ClerkProvider>
  );
}

export function useReconnectBackend() {
  return useContext(RecoveryContext);
}
