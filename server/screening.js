// Lightweight, dependency-free automatic screening for new breeder registrations.
// Legit breeders are auto-approved instantly; this scan never blocks them — it
// only surfaces a "要確認" flag to the admin so suspicious sign-ups can be
// reviewed (and suspended) after the fact. A real LLM-based screen can be layered
// on top later via MOFUBOX_AI_REVIEW, but this keeps sign-up instant and free.

// Red-flag phrases common to pet-resale / scam / animal-welfare-risk listings.
const RISK_PATTERNS = [
  { re: /激安|最安|破格|投げ売り|セール中/, reason: '価格を過度に強調する表現' },
  { re: /転売|せどり|卸|無在庫|大量|まとめ買い|多頭.{0,4}(セット|まとめ)/, reason: '転売・大量取引をうかがわせる表現' },
  { re: /即金|前金のみ|現金限定|手渡しのみ|直接取引限定/, reason: '不自然な取引条件' },
  { re: /稼げ|儲か|副業|不労所得/, reason: '営利勧誘の可能性' },
  { re: /血統書な.{0,3}(多頭|大量)|ワクチンな.{0,3}販売/, reason: '健康・血統管理への懸念' },
  { re: /(LINE|ライン|テレグラム|telegram).{0,6}(のみ|だけ|直接)/i, reason: '外部への誘導' },
];

// Returns { flagged: boolean, reasons: string[] } for a breeder registration.
function screenBreeder({ kennel, name, bio, address }) {
  const haystack = [kennel, name, bio, address].filter(Boolean).join(' ');
  const reasons = [];
  for (const { re, reason } of RISK_PATTERNS) {
    if (re.test(haystack) && !reasons.includes(reason)) reasons.push(reason);
  }
  return { flagged: reasons.length > 0, reasons };
}

module.exports = { screenBreeder };
