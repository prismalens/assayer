// The body format the prompts ask for; a finding without it posted as an unlabelled "Major".
const HEADER = /^_[^_\n]+_ \| _(🔴 Critical|🟠 Major|🟡 Minor)_ \| _[^_\n]+_\s*$/u;
export function formatProblem(body) {
  const first = String(body ?? '').split('\n')[0];
  if (!HEADER.test(first)) return 'its first line is not `_<Category>_ | _<Severity>_ | _<Effort>_` with Severity one of 🔴 Critical, 🟠 Major, 🟡 Minor, as the prompt describes';
  if (!/\*\*[^*\n]+\*\*/.test(String(body))) return 'it has no bold title line (**…**) naming the defect';
  return null;
}
