import { isClerkAPIResponseError, useSignIn } from "@clerk/expo";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "@/components/workshop/theme";
import { WorkshopButton } from "@/components/workshop/WorkshopButton";
import { WorkshopShell } from "@/components/workshop/WorkshopShell";
import { Field } from "@/features/setup/parts";

const MESSAGES: Record<string, string> = {
  form_identifier_not_found:
    "That email isn’t on the guest list yet. Ask whoever invited you to add it.",
  form_code_incorrect:
    "That code doesn’t match. Check the email and try again.",
  verification_expired: "That code has expired. Ask for a new one.",
  verification_failed: "That code has expired. Ask for a new one.",
  form_param_format_invalid: "Check the email address and try again.",
};

export function signInMessage(error: unknown) {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    const known = first ? MESSAGES[first.code] : undefined;
    if (known) return known;
    if (error.status === 429)
      return "Too many tries. Wait a minute, then try again.";
    return first?.longMessage ?? first?.message ?? "Sign-in failed.";
  }
  return "We couldn’t reach the sign-in service. Check the connection.";
}

/**
 * Invited family and friends sign in with a one-time code sent to their
 * email. Nobody can create their own account; the host adds guests in Clerk.
 */
export function SignInScreen({ checking }: { checking: boolean }) {
  return (
    <WorkshopShell>
      {checking ? (
        <View style={styles.checking}>
          <ActivityIndicator
            accessibilityLabel="Checking your sign-in"
            color={colors.ink}
          />
          <Text style={styles.muted}>Opening the workshop…</Text>
        </View>
      ) : (
        <EmailCodeForm />
      )}
    </WorkshopShell>
  );
}

function EmailCodeForm() {
  const { signIn, fetchStatus } = useSignIn();
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  async function sendCode() {
    const emailAddress = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(emailAddress)) {
      setError("Enter the email address you were invited with.");
      return;
    }
    setError(null);
    const result = await signIn.emailCode.sendCode({ emailAddress });
    if (result.error) return setError(signInMessage(result.error));
    setCode("");
    setStage("code");
  }

  async function verify() {
    setError(null);
    const result = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (result.error) return setError(signInMessage(result.error));
    if (signIn.status !== "complete")
      return setError("We couldn’t finish signing you in. Ask for a new code.");
    const finished = await signIn.finalize();
    if (finished.error) setError(signInMessage(finished.error));
  }

  async function startOver() {
    await signIn.reset();
    setError(null);
    setStage("email");
  }

  return (
    <View style={styles.form}>
      <Text accessibilityRole="header" style={styles.heading}>
        Welcome to the story workshop
      </Text>
      {stage === "email" ? (
        <>
          <Text style={styles.body}>
            Tales Together is for invited family and friends. Enter your email
            and we’ll send you a six-digit code.
          </Text>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={sendCode}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            inputMode="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="send"
            error={error}
          />
          <WorkshopButton
            label="Email me a code"
            onPress={sendCode}
            busy={busy}
          />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            We sent a code to {email.trim()}. It can take a minute; check your
            spam folder too.
          </Text>
          <Field
            label="Six-digit code"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
            onSubmitEditing={verify}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            error={error}
          />
          <WorkshopButton
            label="Sign in"
            onPress={verify}
            busy={busy}
            disabled={code.trim().length !== 6}
          />
          <WorkshopButton
            label="Use a different email"
            variant="secondary"
            onPress={startOver}
            disabled={busy}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  checking: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  form: { gap: spacing.lg, maxWidth: 520 },
  heading: { ...type.heading, color: colors.ink },
  body: { ...type.body, color: colors.ink },
  muted: { ...type.small, color: colors.mutedInk },
});
