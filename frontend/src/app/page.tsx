import { Hero } from "@/components/sections/landing-page/hero";
import { ProblemSection } from "@/components/sections/landing-page/problem-section";

export default function Home() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <div className="h-screen"></div>
    </main>
  );
}
