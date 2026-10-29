import { Hero } from "@/components/sections/landing-page/hero";
import dynamic from "next/dynamic";
const ProblemSection = dynamic(() =>
  import("@/components/sections/landing-page/problem-section").then(
    (module) => module.ProblemSection,
  ),
);

export default function Home() {
  return (
    <main>
      <Hero />
      <ProblemSection />
      <div className="h-screen"></div>
    </main>
  );
}
