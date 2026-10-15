import { PolicyPage, policyMetadata } from "@/components/ui/PolicyPage";

export const metadata = policyMetadata("termos");

export default function Page() {
  return <PolicyPage slug="termos" />;
}
