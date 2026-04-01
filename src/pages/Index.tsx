import { BenefitsComparison } from "@/components/landing/BenefitsComparison";
import { ChatDemo } from "@/components/landing/ChatDemo";
import { Demo } from "@/components/landing/Demo";
import { FAQ } from "@/components/landing/FAQ";
import { FinalCTA } from "@/components/landing/FinalCTA";
import { Footer } from "@/components/landing/Footer";
import { GymModeSection } from "@/components/landing/GymModeSection";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Navbar } from "@/components/landing/Navbar";
import { Pricing } from "@/components/landing/Pricing";
import { SocialProof } from "@/components/landing/SocialProof";
import { Testimonials } from "@/components/landing/Testimonials";
import { TrustStrip } from "@/components/landing/TrustStrip";
import { UseCases } from "@/components/landing/UseCases";

const Index = () => {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <Navbar />
      <main>
        <Hero />
        <SocialProof />          {/* stats + risk reversal (bigger text, visible) */}
        <TrustStrip />
        <Testimonials />          {/* ← moved up: người dùng thật before comparison */}
        <BenefitsComparison />    {/* merged: 2 benefit | comparison table | 2 benefit */}
        <GymModeSection />        {/* ← moved above ChatDemo */}
        <ChatDemo />              {/* real chat demo cards */}
        <UseCases />
        <Demo />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
