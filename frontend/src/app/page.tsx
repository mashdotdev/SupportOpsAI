import { Hero } from "@/components/sections/landing-page/hero";
import { ProblemSection } from "@/components/sections/landing-page/problem-section";
import { SupportOps } from "@/components/sections/landing-page/support-ops";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <SupportOps />
    </main>
  );
}
