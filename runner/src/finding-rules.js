// The body format the prompts ask for; a finding without it posted as an unlabelled "Major".
const HEADER = /^_[^_\n]+_ \| _(🔴 Critical|🟠 Major|🟡 Minor)_ \| _[^_\n]+_\s*$/u;
export function formatProblem(body) {
  const first = String(body ?? '').split('\n')[0];
  if (!HEADER.test(first)) return 'the first line must be exactly `_<Category>_ | _<Severity>_ | _<Effort>_`, with Severity one of 🔴 Critical, 🟠 Major, 🟡 Minor, as the prompt describes; re-file the finding in that format';
  if (!/\*\*[^*\n]+\*\*/.test(String(body))) return 'the body needs a bold title line (**…**) naming the defect; re-file the finding with one';
  return null;
}
