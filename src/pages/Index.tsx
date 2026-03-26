import { Benefits } from "@/components/landing/Benefits";
import { Demo } from "@/components/landing/Demo";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Navbar } from "@/components/landing/Navbar";
import { Pricing } from "@/components/landing/Pricing";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { UseCases } from "@/components/landing/UseCases";

const Index = () => {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Navbar />
      <main>
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <Benefits />
        <Demo />
        <UseCases />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
