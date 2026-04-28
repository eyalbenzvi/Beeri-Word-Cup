import { computeBestCase } from "../utils/bestCase";

self.onmessage = (e: MessageEvent) => {
  const { targetFormId, allForms, playedResults } = e.data;
  try {
    const result = computeBestCase(
      targetFormId,
      allForms,
      playedResults,
      (phase, percent) => self.postMessage({ type: "progress", phase, percent }),
    );
    self.postMessage({ type: "result", result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err) });
  }
};
