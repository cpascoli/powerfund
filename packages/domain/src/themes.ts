export const CORE_THEME_SLUGS = [
  "ai-infrastructure",
  "energy",
  "robotics-ai",
  "defence",
  "other",
] as const;

export type CoreThemeSlug = (typeof CORE_THEME_SLUGS)[number];

export const CORE_THEMES: ReadonlyArray<{
  slug: CoreThemeSlug;
  name: string;
  description: string;
  isCore: boolean;
  sortOrder: number;
}> = [
  {
    slug: "ai-infrastructure",
    name: "AI Infrastructure",
    description:
      "Compute, networking, data centers, and supply chain behind AI demand.",
    isCore: true,
    sortOrder: 1,
  },
  {
    slug: "energy",
    name: "Energy",
    description:
      "Power generation, grid, and fuels that constrain AI and electrification.",
    isCore: true,
    sortOrder: 2,
  },
  {
    slug: "robotics-ai",
    name: "Robotics and AI",
    description:
      "Industrial automation, embodied AI, and robotics commercialization.",
    isCore: true,
    sortOrder: 3,
  },
  {
    slug: "defence",
    name: "Defence",
    description:
      "Defence programs, drones, autonomy, and related industrial capacity.",
    isCore: true,
    sortOrder: 4,
  },
  {
    slug: "other",
    name: "Other",
    description: "Opportunities outside core themes that clear the evidence bar.",
    isCore: false,
    sortOrder: 99,
  },
];
