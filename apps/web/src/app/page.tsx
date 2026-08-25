import { Landing } from "@/components/landing";

export const metadata = {
  title: {
    absolute: "Power Fund",
  },
  description:
    "Investment intelligence for managing and growing capital in AI infrastructure, energy, robotics/AI, and defence.",
};

export default function HomePage() {
  return <Landing />;
}
