import Image from "next/image";
import type { Metadata } from "next";
import PublicFooter from "../components/PublicFooter";
import PublicHeader from "../components/PublicHeader";
import roadmapFruitApple from "../assets/roadmap-fruit-apple.png";
import roadmapFruitCherries from "../assets/roadmap-fruit-cherries.png";
import roadmapFruitPear from "../assets/roadmap-fruit-pear.png";

export const metadata: Metadata = {
  title: "Roadmap · Orchard",
  description:
    "See what Orchard is working on, what is planned, and what has shipped.",
};

const roadmapGroups = [
  {
    title: "Active",
    image: roadmapFruitCherries,
    marker: "border-[#f7eef1] bg-[#bd465a]",
    background:
      "bg-[radial-gradient(62%_80%_at_88%_18%,rgba(181,64,84,0.08),transparent_65%),linear-gradient(180deg,#f2f5f8_0%,#f7eef1_38%,#f7eef1_82%,#eff3e7_100%)]",
    items: [
      {
        title: "Bring your own API key",
        description:
          "Connect your own model provider credentials and use them in Orchard.",
      },
      {
        title: "Product language",
        description:
          "Finish bringing the Orchard identity into every remaining part of the product.",
      },
      {
        title: "Open-source direction",
        description:
          "Work out what an open-source Orchard release should include.",
      },
    ],
  },
  {
    title: "Planned",
    image: roadmapFruitPear,
    marker: "border-[#eff3e7] bg-[#a58f2f]",
    background:
      "bg-[linear-gradient(180deg,#eff3e7_0%,#eff3e7_82%,#e5e9f6_100%)]",
    items: [
      {
        title: "Study presets",
        description:
          "Add focused starting points such as Teach me, Deep study, and Quiz me.",
      },
      {
        title: "Better keyboard workflows",
        description:
          "Add shortcuts for moving through chats, threads, and branches.",
      },
      {
        title: "PDF and image context",
        description:
          "Make documents and images more useful across search and later turns.",
      },
      {
        title: "Search quality",
        description:
          "Keep improving live search against real provider traffic and sources.",
      },
      {
        title: "Learning path summaries",
        description:
          "Summarize the path through a main chat, its branches, and inline threads.",
      },
    ],
  },
  {
    title: "Launched",
    image: roadmapFruitApple,
    marker: "border-[#e5e9f6] bg-[#3749ad]",
    background:
      "bg-[linear-gradient(180deg,#e5e9f6_0%,#e5e9f6_82%,#dce2ef_100%)]",
    items: [
      {
        title: "Inline threads",
        description:
          "Ask a focused follow-up beside any part of an answer without losing your place.",
      },
      {
        title: "Conversation branches",
        description:
          "Explore another direction while preserving the original conversation.",
      },
      {
        title: "Response style",
        description:
          "Choose the length and assumed knowledge level for each chat.",
      },
      {
        title: "Live search",
        description:
          "Bring current sources into a conversation when a question needs them.",
      },
    ],
  },
] as const;

export default function RoadmapPage() {
  const futureRoadmapGroups = roadmapGroups.slice(0, 2);
  const launchedGroup = roadmapGroups[2];

  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-[#f7f9fc] text-[#111827]"
      style={{ colorScheme: "light" }}
    >
      <PublicHeader />

      <main className="flex-1">
        <section
          aria-labelledby="roadmap-heading"
          className="bg-[radial-gradient(58%_32%_at_90%_18%,rgba(181,64,84,0.08),transparent_68%),linear-gradient(180deg,#f7f9fc_0%,#f7eef1_28%,#eff3e7_70%,#e5e9f6_100%)]"
        >
          <div className="mx-auto w-full max-w-[74rem] px-5 pb-16 pt-14 sm:px-10 sm:pb-20 sm:pt-20 lg:px-12">
            <h1
              id="roadmap-heading"
              className="font-serif text-[clamp(2.8rem,4.5vw,4rem)] font-normal leading-none tracking-[-0.025em]"
            >
              Roadmap
            </h1>

            <div className="relative mt-8 sm:mt-10">
              <div
                aria-hidden="true"
                className="absolute bottom-3 left-[0.3125rem] top-8 w-px bg-[#111827]/18 lg:left-[18.3125rem]"
              />

              {futureRoadmapGroups.map((group, groupIndex) => (
                <section
                  key={group.title}
                  aria-labelledby={`roadmap-${group.title.toLowerCase()}`}
                  className={groupIndex === 0 ? "" : "mt-8 sm:mt-10"}
                >
                  <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-16">
                    <div className="flex items-center gap-4 pl-8 lg:block lg:pl-0">
                      <div
                        aria-hidden="true"
                        className="relative size-16 shrink-0 sm:size-20 lg:-ml-2"
                      >
                        <Image
                          src={group.image}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 4rem, 5rem"
                          className="object-contain"
                        />
                      </div>
                      <div className="lg:mt-2">
                        <h2
                          id={`roadmap-${group.title.toLowerCase()}`}
                          className="font-serif text-[clamp(2rem,3vw,2.65rem)] font-normal leading-none tracking-[-0.02em] text-[#202634]"
                        >
                          {group.title}
                        </h2>
                      </div>
                    </div>

                    <div className="pl-8">
                      {group.items.map((item) => (
                        <article
                          key={item.title}
                          className="relative pb-7 last:pb-0 sm:pb-8"
                        >
                          <span
                            aria-hidden="true"
                            className={`absolute -left-8 top-1.5 size-2.5 rounded-full border-2 ${group.marker}`}
                          />
                          <h3 className="font-sans text-[1.05rem] font-medium leading-snug text-[#111827]">
                            {item.title}
                          </h3>
                          <p className="mt-2 max-w-[32rem] font-sans text-[15px] leading-relaxed text-[#5f6875]">
                            {item.description}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <section
          aria-labelledby={`roadmap-${launchedGroup.title.toLowerCase()}`}
          className={`relative overflow-hidden ${launchedGroup.background}`}
        >
          <div className="mx-auto grid w-full max-w-[74rem] gap-8 px-5 py-14 sm:px-10 sm:py-16 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16 lg:px-12 lg:py-20">
            <div className="flex items-center gap-4 lg:block">
              <div
                aria-hidden="true"
                className="relative size-16 shrink-0 sm:size-20 lg:-ml-2"
              >
                <Image
                  src={launchedGroup.image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 4rem, 5rem"
                  className="object-contain"
                />
              </div>
              <div className="lg:mt-2">
                <h2
                  id={`roadmap-${launchedGroup.title.toLowerCase()}`}
                  className="font-serif text-[clamp(2rem,3vw,2.65rem)] font-normal leading-none tracking-[-0.02em] text-[#202634]"
                >
                  {launchedGroup.title}
                </h2>
              </div>
            </div>

            <div className="relative max-w-[46rem] pl-8">
              <div
                aria-hidden="true"
                className="absolute bottom-2 left-[0.3125rem] top-2 w-px bg-[#111827]/18"
              />
              {launchedGroup.items.map((item) => (
                <article
                  key={item.title}
                  className="relative pb-8 last:pb-0 sm:pb-9"
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -left-8 top-1.5 size-[0.6875rem] rounded-full border-[3px] ${launchedGroup.marker}`}
                  />
                  <h3 className="font-sans text-[1.05rem] font-medium leading-snug text-[#111827]">
                    {item.title}
                  </h3>
                  <p className="mt-2 max-w-[28rem] font-sans text-[15px] leading-relaxed text-[#5f6875]">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <div className="bg-[#dce2ef]">
        <PublicFooter />
      </div>
    </div>
  );
}
