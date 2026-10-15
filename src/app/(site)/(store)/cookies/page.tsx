import { PolicyPage, policyMetadata } from "@/components/ui/PolicyPage";

export const metadata = policyMetadata("cookies");

export default function Page() {
  return <PolicyPage slug="cookies" />;
}
