import { createSignal } from "solid-js";

/** Connection row stage 2 fills from the acc-status event. */
export type AccLink = {
  linked: boolean;
  hz: number | null;
  packetId: number | null;
};

/** Track and car in the analysis header. Null until a lap is loaded. */
export type AnalysisHeading = {
  track: string | null;
  car: string | null;
};

const [accLink, setAccLink] = createSignal<AccLink>({
  linked: false,
  hz: null,
  packetId: null,
});

const [analysisHeading, setAnalysisHeading] = createSignal<AnalysisHeading>({
  track: null,
  car: null,
});

export { accLink, analysisHeading, setAccLink, setAnalysisHeading };
