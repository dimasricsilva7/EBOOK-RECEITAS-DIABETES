import { PolicyPage, policyMetadata } from "@/components/ui/PolicyPage";

export const metadata = policyMetadata("politica-de-privacidade");

export default function Page() {
  return <PolicyPage slug="politica-de-privacidade" />;
}
