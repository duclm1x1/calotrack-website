import { Benefits } from "@/components/landing/Benefits";
import { ChatDemo } from "@/components/landing/ChatDemo";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
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
        <SocialProof />        {/* P1: stats + risk reversal */}
        <TrustStrip />
        <ComparisonTable />    {/* P1: CaloTrack vs traditional */}
        <ChatDemo />           {/* P2: real chat demo screenshots */}
        <UseCases />
        <Benefits />
        <GymModeSection />     {/* P2: dedicated Gym Mode section */}
        <Demo />
        <HowItWorks />
        <Testimonials />       {/* P3: before/after weight results */}
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
