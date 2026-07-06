import type { Metadata } from "next";

import { EducationCopilotWebsite } from "@/components/marketing/education-copilot-website";

export const metadata: Metadata = {
  title: "Education Copilot | Built for Victorian schools",
  description: "Teacher-controlled AI for VCE practice, feedback and classroom insight—built for Victorian schools.",
};

export default function WebsitePage() {
  return <EducationCopilotWebsite />;
}
