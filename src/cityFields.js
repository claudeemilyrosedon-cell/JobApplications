// Per-city details for roles already in the tracker, keyed by posting URL.
// scoring.js uses these in place of guessing from the location text, so roles
// added before the four-city prompt still get exact city scores.
const N = null;
const f = (la, raleigh, charlotte, atlanta, returnReady, atlantaArea = N) =>
  ({ cityAccess: { la, raleigh, charlotte, atlanta }, returnReady, atlantaArea });

export const CITY_FIELDS = {
  // Added 2026-11-24
  "https://carolinasolarservices.bamboohr.com/careers/141": f("none", "hybrid", "none", "none", "local_only"),
  "https://job-boards.greenhouse.io/affirm/jobs/7808142003": f("remote", "remote", "remote", "remote", "remote_keepable"),
  "https://careers-greensky.icims.com/jobs/5199/agentic-%28ai%29-native-produce-manager/job": f("none", "none", "none", "hybrid", "local_only", "perimeter"),
  "https://www.adzuna.com/details/5878269217": f("none", "none", "none", "onsite", "local_only", "north_suburbs"),
  "https://job-boards.eu.greenhouse.io/nice/jobs/5028987101": f("none", "none", "none", "hybrid", "local_only", "unknown"),
  "https://delta.avature.net/en_us/careers/jobdetail": f("none", "none", "none", "hybrid", "local_only", "unknown"),
  "https://swordpoint.zohorecruit.com/jobs/careers/839397000000996055/senior-product-manager": f("none", "none", "none", "onsite", "local_only", "intown"),
  "https://jobs.ashbyhq.com/arrive/c5c7e994-c5e7-4b89-b240-0a394b38d214": f("none", "none", "none", "hybrid", "local_only", "unknown"),
  "https://providi.bamboohr.com/careers/71": f("none", "none", "none", "hybrid", "local_only", "unknown"),
  "https://jobs.ashbyhq.com/aerovect/d05135a5-2796-4c68-b4a5-f991cedffb1d": f("remote", "remote", "remote", "remote", "remote_keepable", "unknown"),
  "https://stord.wd503.myworkdayjobs.com/stord_external_career/job/atl1---atlanta-ga/product-manager--apm-pm-sr-pm-staff-pm-_jr102852": f("none", "none", "none", "hybrid", "local_only", "intown"),
};
