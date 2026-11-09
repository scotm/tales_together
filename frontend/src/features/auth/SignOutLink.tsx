import { useClerk } from "@clerk/expo";
import { FooterLink } from "@/components/workshop/WorkshopShell";

/** Quiet footer link: a child should not sign the family out by accident. */
export function SignOutLink() {
  const { signOut } = useClerk();
  return <FooterLink label="Sign out" onPress={() => void signOut()} />;
}
