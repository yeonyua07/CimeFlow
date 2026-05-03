import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { ChannelType } from "./types";
import cimeFind from "./cimeFind";

interface GlobalOptionState {
  channel: ChannelType;
  voice: string;
  theme: "dark" | "light";
  zoom: number;
  hydrated: boolean;
}

interface GlobalOptionActions {
  setChannel: (channel: ChannelType) => void;
  setVoice: (voice: string) => void;
  setTheme: () => void;
  setZoom: (zoom: number) => void;
  setHydrated: (hydrated: boolean) => void;
  refreshChannel: (channelId: string) => void;
}

export const useGlobalOptionStore = create<
  GlobalOptionState & GlobalOptionActions
>()(
  devtools(
    persist(
      (set) => ({
        channel: {
          channelId: "",
          channelImageUrl: "",
          channelName: "",
          verifiedMark: false,
          followerCount: 0,
        },
        voice: "",
        theme: "dark",
        zoom: 100,
        hydrated: false,

        setChannel: (channel: ChannelType) => set({ channel }),
        setVoice: (voice: string) => set({ voice }),
        setTheme: () =>
          set((prev) => ({
            ...prev,
            theme: prev.theme === "dark" ? "light" : "dark",
          })),
        setZoom: (zoom: number) => set({ zoom }),
        setHydrated: (hydrated: boolean) => set({ hydrated }),
        refreshChannel: async (channelId: string) => {
          const channel = await cimeFind(channelId);
          if (!channel) return;
          set({ channel });
        },
      }),
      {
        name: "globalOption",
        onRehydrateStorage: () => (state) => {
          // Next.js SSR hydration이 완료된 직후 동기적으로 실행되면 상태 불일치가 발생할 수 있습니다.
          // setTimeout(0) 대신 10ms를 사용하여 React 렌더링 사이클이 먼저 완료되도록 합니다.
          setTimeout(() => {
            const store = useGlobalOptionStore.getState();
            store.setHydrated(true);
            if (store.channel.channelId) {
              store.refreshChannel(store.channel.channelId);
            }
          }, 10);
        },
      }
    )
  )
);
