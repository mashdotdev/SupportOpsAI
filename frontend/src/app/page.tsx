import { CTABannerSection } from "@/components/sections/landing-page/cta-banner";
import { EngineeringSection } from "@/components/sections/landing-page/engineering-section";
import { Hero } from "@/components/sections/landing-page/hero";
import { HowItWorks } from "@/components/sections/landing-page/how-it-works";
import { ProblemSection } from "@/components/sections/landing-page/problem-section";
import { SupportOps } from "@/components/sections/landing-page/support-ops";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <SupportOps />
      <HowItWorks />
      <EngineeringSection />
      <CTABannerSection />
    </main>
  );
}
