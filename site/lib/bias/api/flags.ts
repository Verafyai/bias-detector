/**
 * One switch for every "simulated" label on the Bias Detector.
 * Pages and the API read this flag and nothing else. This deployment serves only sealed,
 * measured runs, so the flag is on unless DATA_IS_MEASURED is set to something other than "true".
 */
const DEPLOYMENT_DEFAULT = "true";

export function dataIsMeasured(env?: Record<string, string | undefined>): boolean {
  if (env) return env.DATA_IS_MEASURED === "true" || env.BIAS_DATA_IS_MEASURED === "true";
  const value = process.env.DATA_IS_MEASURED ?? process.env.BIAS_DATA_IS_MEASURED ?? DEPLOYMENT_DEFAULT;
  return value === "true";
}

export const DATA_IS_MEASURED = dataIsMeasured();
