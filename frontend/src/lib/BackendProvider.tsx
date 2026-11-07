import { ConvexProvider } from "convex/react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { convex, createConvexClient } from "./convex";

const RecoveryContext = createContext<() => void>(() => {});

export function BackendProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState(convex);

  function reconnect() {
    const state = client.connectionState();
    // Closing a client discards queued writes. Let those finish/reconnect first.
    if (state.inflightMutations || state.inflightActions) return;
    void client.close();
    setClient(createConvexClient());
  }

  return (
    <RecoveryContext.Provider value={reconnect}>
      <ConvexProvider client={client}>{children}</ConvexProvider>
    </RecoveryContext.Provider>
  );
}

export function useReconnectBackend() {
  return useContext(RecoveryContext);
}
